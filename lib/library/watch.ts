import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { paths } from "@/lib/paths";
import { isOwnWrite, pruneOwnWrites, store } from "./store";
import type { WatchHandle } from "./store";
import { isSlug } from "./slug";
import type { Slug, WatchMode } from "./types";

/*
 * Das Versprechen der Mediathek lautet: Claude Code trägt Kapitel ein, die
 * App zeigt sie — ohne Serverneustart. Dieses Versprechen hängt an fs.watch,
 * und fs.watch ist auf Netzlaufwerken nicht verlässlich: der Aufruf kann
 * fehlschlagen ODER erfolgreich sein und Ereignisse still verschlucken.
 *
 * Deshalb dreistufig:
 *   1. fs.watch mit recursive -- auf lokalem NTFS die richtige Wahl.
 *   2. Flache Watches auf medien/ und themen/ -- fangen neue Ordner.
 *   3. IMMER ein Poller, der zugleich prüft, ob der Watcher lügt.
 *
 * Findet der Poller eine Änderung, die der Watcher nicht gemeldet hat, wird
 * der Modus auf "poll" heruntergestuft und das in den Einstellungen
 * angezeigt. Der Nutzer sieht also, in welchem Zustand er ist — das ist
 * wichtiger als Perfektion.
 */

const DEBOUNCE_MS = 500;
const DEFAULT_POLL_MS = 30_000;

/** Dateien und Ordner, die keinen Rescan wert sind. */
function isIgnored(relative: string): boolean {
  const normalized = relative.replace(/\\/g, "/");
  if (!normalized) return true;
  if (normalized.startsWith(".import/")) return true;
  if (normalized.startsWith(".claude/")) return true;
  if (normalized === "library.json" || normalized === "library.json.tmp") {
    return true;
  }
  const base = path.posix.basename(normalized);
  if (base.startsWith(".~") || base.endsWith(".tmp") || base.endsWith(".part")) {
    return true;
  }
  return false;
}

/** Aus einem gemeldeten Pfad den betroffenen Slug ableiten. */
function slugFromRelative(relative: string): Slug | "alles" | null {
  const normalized = relative.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  if (parts[0] === "medien") {
    if (parts.length === 1) return "alles";
    const slug = parts[1].toLowerCase();
    return isSlug(slug) ? slug : "alles";
  }
  // Themen, Sammlungen und das Glossar wirken auf die ganze Ansicht.
  if (["themen", "sammlungen"].includes(parts[0])) return "alles";
  if (parts[0] === "glossar.txt") return "alles";
  return null;
}

type Snapshot = Map<string, string>;

/**
 * Schlüssel für den Zustand der Themendateien im Abdruck. Das "@" ist im
 * Slug-Muster verboten, kann also nie mit einem Beitrag kollidieren.
 */
const TOPICS_KEY = "@themen";

/**
 * Ein billiger Zustandsabdruck der Bibliothek für den Poller: je
 * Beitragsordner Anzahl, Größen und Zeitstempel der Dateien.
 *
 * Bewusst OHNE Vergleich gegen Date.now(): die Uhr eines NAS läuft anders als
 * die des Rechners.
 */
async function takeSnapshot(): Promise<Snapshot> {
  const snapshot: Snapshot = new Map();

  let dirs: string[] = [];
  try {
    dirs = (await fs.readdir(paths.items, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name);
  } catch {
    return snapshot;
  }

  for (const name of dirs) {
    const slug = name.toLowerCase();
    if (!isSlug(slug)) continue;
    const dir = path.join(paths.items, name);
    try {
      const files = await fs.readdir(dir, { withFileTypes: true });
      const parts: string[] = [];
      for (const file of files) {
        if (!file.isFile()) continue;
        const info = await fs.stat(path.join(dir, file.name));
        parts.push(`${file.name}:${info.size}:${Math.round(info.mtimeMs)}`);
      }
      parts.sort();
      snapshot.set(slug, parts.join("|"));
    } catch {
      snapshot.set(slug, "unlesbar");
    }
  }

  try {
    const topics = await fs.readdir(paths.topics, { withFileTypes: true });
    const parts: string[] = [];
    for (const file of topics) {
      if (!file.isFile()) continue;
      const info = await fs.stat(path.join(paths.topics, file.name));
      parts.push(`${file.name}:${info.size}:${Math.round(info.mtimeMs)}`);
    }
    parts.sort();
    snapshot.set(TOPICS_KEY, parts.join("|"));
  } catch {
    // Kein themen/-Ordner ist in Ordnung.
  }

  return snapshot;
}

function diffSnapshots(before: Snapshot, after: Snapshot): Slug[] | "alles" {
  const changed: Slug[] = [];
  for (const [key, value] of after) {
    if (key === TOPICS_KEY) {
      if (before.get(key) !== value) return "alles";
      continue;
    }
    if (before.get(key) !== value) changed.push(key);
  }
  for (const key of before.keys()) {
    // Ein verschwundener Beitrag ändert die Liste, nicht nur einen Eintrag.
    if (!after.has(key)) return "alles";
  }
  return changed;
}

export type StartWatchingOptions = {
  onChange: (slugs: Slug[] | "alles", source: "watch" | "poll") => void;
  pollMs?: number;
};

export function startWatching(options: StartWatchingOptions): WatchHandle {
  const pollMs = Math.max(
    5_000,
    options.pollMs ??
      Number(process.env.MEDIATHEK_POLL_MS ?? DEFAULT_POLL_MS) ??
      DEFAULT_POLL_MS,
  );

  const watchers: fsSync.FSWatcher[] = [];
  let mode: WatchMode = "aus";
  let error: string | null = null;
  let closed = false;

  // Sammelt Änderungen und meldet sie gebündelt.
  const pending = new Set<Slug>();
  let pendingAll = false;
  let timer: NodeJS.Timeout | null = null;
  /** Was der Watcher seit dem letzten Poll gemeldet hat. */
  let reportedSincePoll = false;
  /** Wann der letzte Durchgang war — zum Abgleich mit eigenen Schreibvorgängen. */
  let lastPollAt = Date.now();

  const flush = () => {
    timer = null;
    if (closed) return;
    const all = pendingAll;
    const slugs = [...pending];
    pendingAll = false;
    pending.clear();
    if (!all && slugs.length === 0) return;
    reportedSincePoll = true;
    options.onChange(all ? "alles" : slugs, "watch");
  };

  const schedule = (target: Slug | "alles") => {
    if (target === "alles") pendingAll = true;
    else pending.add(target);
    if (timer) clearTimeout(timer);
    // Ein Editor-Speichervorgang erzeugt zwei bis fünf Ereignisse. Das
    // Entprellen ist Pflicht, keine Optimierung.
    timer = setTimeout(flush, DEBOUNCE_MS);
    timer.unref?.();
  };

  const handleEvent = (relativeRaw: string | null, base = "") => {
    if (closed || !relativeRaw) return;
    const relative = base
      ? path.posix.join(base, relativeRaw.replace(/\\/g, "/"))
      : relativeRaw.replace(/\\/g, "/");
    if (isIgnored(relative)) return;
    if (isOwnWrite(path.join(paths.library, relative))) return;
    const target = slugFromRelative(relative);
    if (target === null) return;
    schedule(target);
  };

  // Stufe 1: rekursiv. Auf lokalem NTFS bildet Node das auf
  // ReadDirectoryChangesW ab und es funktioniert inklusive Unterordner.
  try {
    const watcher = fsSync.watch(
      paths.library,
      { recursive: true, persistent: false },
      (_event, filename) => {
        handleEvent(typeof filename === "string" ? filename : null);
      },
    );
    watcher.on("error", (cause) => {
      error = cause instanceof Error ? cause.message : String(cause);
      mode = "poll";
    });
    watchers.push(watcher);
    mode = "recursive";
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  // Stufe 2: flache Watches, falls rekursiv nicht ging.
  if (mode !== "recursive") {
    for (const [dir, base] of [
      [paths.items, "medien"],
      [paths.topics, "themen"],
    ] as const) {
      try {
        const watcher = fsSync.watch(
          dir,
          { persistent: false },
          (_event, filename) => {
            handleEvent(typeof filename === "string" ? filename : null, base);
          },
        );
        watcher.on("error", () => {});
        watchers.push(watcher);
        mode = "flach";
      } catch {
        // Bleibt beim Poller.
      }
    }
  }

  // Stufe 3: der Poller läuft IMMER — und prüft zugleich den Watcher.
  let snapshot: Snapshot = new Map();
  void takeSnapshot().then((initial) => {
    snapshot = initial;
  });

  const poll = async () => {
    if (closed) return;
    pruneOwnWrites();
    /*
     * Seit dem letzten Durchgang selbst geschrieben? Dann stammt eine
     * gefundene Änderung von uns. Der Beobachter hat sie zu Recht nicht
     * gemeldet (er ignoriert eigene Schreibvorgänge), und der Modus darf
     * deswegen nicht heruntergestuft werden — sonst stünde nach jedem
     * Speichern im Editor "Änderungen werden nicht gemeldet".
     */
    const ownWriteSincePoll = store.lastOwnWriteAt > lastPollAt;
    lastPollAt = Date.now();
    try {
      const next = await takeSnapshot();
      const changed = diffSnapshots(snapshot, next);
      snapshot = next;
      const hasChange = changed === "alles" || changed.length > 0;
      if (!hasChange) {
        reportedSincePoll = false;
        return;
      }
      if (!reportedSincePoll && !ownWriteSincePoll && mode !== "poll") {
        /*
         * Der Poller hat etwas gefunden, das der Watcher nicht gemeldet hat.
         * Genau das ist der SMB-Fall: der Watcher lebt, liefert aber nichts.
         */
        mode = "poll";
        error =
          "Änderungen werden nicht gemeldet (typisch auf einem " +
          "Netzlaufwerk). Es wird stattdessen regelmäßig nachgesehen.";
        console.warn(
          "[bibliothek] Der Verzeichnis-Beobachter meldet nichts — " +
            "es wird auf regelmäßiges Nachsehen umgestellt.",
        );
      }
      reportedSincePoll = false;
      options.onChange(changed, "poll");
    } catch {
      // Ein einzelner Fehlschlag ist kein Grund, den Poller zu beenden.
    }
  };

  const interval = setInterval(() => void poll(), pollMs);
  interval.unref?.();

  return {
    get mode() {
      return mode;
    },
    get error() {
      return error;
    },
    close() {
      closed = true;
      clearInterval(interval);
      if (timer) clearTimeout(timer);
      for (const watcher of watchers) {
        try {
          watcher.close();
        } catch {
          // Beim Herunterfahren gleichgültig.
        }
      }
    },
  };
}
