import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { getFeatures } from "@/lib/features";
import { getLibrary } from "@/lib/library";
import { isSlug } from "@/lib/library/slug";
import { ITEM_FILES, paths } from "@/lib/paths";
import { libraryStateDir } from "@/lib/settings";

/*
 * Die Brücke zu Claude Code.
 *
 * Kapitel, Zusammenfassungen, Bezüge und Themenseiten erzeugt Claude Code
 * extern auf den Transkripten — nicht die Mediathek. Dieses Modul öffnet
 * dafür ein sichtbares PowerShell-Fenster im Bibliotheksordner.
 *
 * Das Feature ist bewusst ein LÖSCHBARES PAAR: diese Datei und
 * scripts/kapitel-starten.ps1. Wer beides entfernt, verliert einen Knopf,
 * nichts weiter — der eigentliche Weg bleibt der Handbetrieb:
 *
 *     cd S:\Mediathek
 *     claude
 *     /kapitel akku-pruefen
 *
 * Ein Knopf, der einen Prozess auf der Maschine startet, ist die
 * gefährlichste Stelle der ganzen Anwendung. Deshalb hier vier Riegel,
 * jeder für sich ausreichend:
 *
 *   1. Autorenmodus. Im weitergegebenen Viewer (MEDIATHEK_READONLY=1) ist er
 *      nicht einschaltbar.
 *   2. Server Action. Next prüft dabei Origin gegen Host — ohne das könnte
 *      jede im selben Browser offene Seite per fetch auf 127.0.0.1 einen
 *      Start auslösen.
 *   3. Positivlisten. Der Befehl gegen CLAUDE_COMMANDS, der Slug gegen
 *      SLUG_PATTERN UND gegen das Dateisystem: medien/<slug>/beitrag.md muss
 *      existieren. Ein Angreifer kann nicht einmal einen Namen erfinden.
 *   4. Eine Sperre von zehn Sekunden. Ein durchgehender Aufruf kann nicht
 *      hundert Fenster öffnen.
 *
 * Freitext (Prompts, Glossar) geht NIE auf eine Kommandozeile — die
 * Slash-Befehle in der Bibliothek lesen ihre Quellen selbst aus Dateien.
 */

export const CLAUDE_COMMANDS = [
  "kapitel",
  "kapitel-alle",
  "bezuege",
  "themen",
  "glossar",
] as const;

export type ClaudeCommand = (typeof CLAUDE_COMMANDS)[number];

/** Welche Befehle sich auf einen einzelnen Beitrag beziehen. */
const NEEDS_SLUG = new Set<ClaudeCommand>(["kapitel", "bezuege"]);

export function needsSlug(command: ClaudeCommand): boolean {
  return NEEDS_SLUG.has(command);
}

/** Was der Knopf verspricht — auch für die Beschriftung. */
export const CLAUDE_COMMAND_LABEL: Record<ClaudeCommand, string> = {
  kapitel: "Kapitel und Zusammenfassung erzeugen",
  "kapitel-alle": "Alle Beiträge ohne Kapitel nacharbeiten",
  bezuege: "Verwandte Stellen suchen",
  themen: "Themenseiten erzeugen",
  glossar: "Glossar sammeln",
};

/** Höchstens ein Fenster in zehn Sekunden. */
const MIN_INTERVAL_MS = 10_000;

const globalForClaude = globalThis as unknown as {
  mediathekClaudeLastLaunchAt?: number;
};

export type LaunchResult =
  | { ok: true; prompt: string }
  | { ok: false; error: string };

function isClaudeCommand(value: unknown): value is ClaudeCommand {
  return (CLAUDE_COMMANDS as readonly unknown[]).includes(value);
}

function scriptPath(): string {
  return path.join(process.cwd(), "scripts", "kapitel-starten.ps1");
}

/**
 * Notiert jeden Start maschinenlokal — nicht in der Bibliothek, die ja
 * weitergegeben wird. Wer wissen will, was hier Prozesse gestartet hat,
 * findet es in %LOCALAPPDATA%\Mediathek\<Kennung>\claude-starts.log.
 */
async function note(line: string): Promise<void> {
  try {
    const dir = libraryStateDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(
      path.join(dir, "claude-starts.log"),
      `${new Date().toISOString()}  ${line}\n`,
      "utf8",
    );
  } catch {
    // Ein nicht schreibbares Protokoll darf den Start nicht verhindern.
  }
}

export async function launchClaude(
  command: unknown,
  slug?: unknown,
): Promise<LaunchResult> {
  if (!isClaudeCommand(command)) {
    return { ok: false, error: "Diesen Befehl gibt es nicht." };
  }

  const features = await getFeatures();
  if (features.claude !== "ok") {
    return {
      ok: false,
      error:
        "Claude Code wurde auf dieser Maschine nicht gefunden. Kapitel und " +
        "Zusammenfassungen lassen sich auch von Hand erzeugen: im " +
        "Bibliotheksordner „claude“ starten und den Befehl dort eingeben.",
    };
  }

  let checked: string | null = null;
  if (needsSlug(command)) {
    if (!isSlug(slug)) {
      return { ok: false, error: "Der Beitrag ist keine gültige Kennung." };
    }
    /*
     * Zwei Prüfungen, nicht eine: der Index kann veraltet sein, und die
     * Datei ist das, was Claude Code tatsächlich öffnet.
     */
    const library = await getLibrary();
    if (!library.bySlug.has(slug)) {
      return { ok: false, error: "Diesen Beitrag gibt es nicht." };
    }
    const markdown = path.join(paths.items, slug, ITEM_FILES.markdown);
    try {
      await fs.access(markdown);
    } catch {
      return {
        ok: false,
        error:
          "Zu diesem Beitrag gibt es keine beitrag.md. Sie lässt sich über " +
          "den Bearbeiten-Knopf anlegen.",
      };
    }
    checked = slug;
  }

  const script = scriptPath();
  try {
    await fs.access(script);
  } catch {
    return {
      ok: false,
      error: `Das Startskript fehlt: ${script}`,
    };
  }

  const now = Date.now();
  const last = globalForClaude.mediathekClaudeLastLaunchAt ?? 0;
  if (now - last < MIN_INTERVAL_MS) {
    const wait = Math.ceil((MIN_INTERVAL_MS - (now - last)) / 1000);
    return {
      ok: false,
      error: `Gerade wurde schon ein Fenster geöffnet — noch ${wait} s warten.`,
    };
  }
  globalForClaude.mediathekClaudeLastLaunchAt = now;

  const args = [
    "-NoProfile",
    /*
     * Bypass, weil das Skript unsigniert ist. Kommt der Anwendungsordner von
     * einer Freigabe, gilt er als "remote", und RemoteSigned würde ihn
     * ablehnen. Ausgeführt wird eine Datei aus dem eigenen Programmordner,
     * keine Eingabe von außen.
     */
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    "-LibraryDir",
    paths.library,
    "-Command",
    command,
    ...(checked ? ["-Slug", checked] : []),
  ];

  try {
    const child = spawn("powershell.exe", args, {
      // Kein shell: true. Die Argumente gehen einzeln, nie als eine Zeile.
      shell: false,
      detached: true,
      stdio: "ignore",
      /*
       * Das SICHTBARE Fenster öffnet erst das Skript per Start-Process.
       * Dieser Aufruf hier bleibt verborgen — sonst blitzte bei jedem Klick
       * eine leere Konsole auf.
       */
      windowsHide: true,
    });
    child.unref();
  } catch (error) {
    return {
      ok: false,
      error: `PowerShell ließ sich nicht starten: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const prompt = checked ? `/${command} ${checked}` : `/${command}`;
  await note(`${prompt}  (${paths.library})`);
  return { ok: true, prompt };
}
