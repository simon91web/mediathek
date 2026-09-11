import fs from "node:fs/promises";
import path from "node:path";

import { paths } from "@/lib/paths";
import type {
  Collection,
  Fingerprint,
  Item,
  Question,
  Slug,
  Topic,
} from "./types";

/*
 * library.json ist ein Cache, keine Wahrheit. Sie darf jederzeit gelöscht
 * werden; beim nächsten Start wird sie neu aufgebaut. Sie enthält bewusst
 * KEINE Transkripte und keinen Suchindex — nur das, was ein Kaltstart auf
 * einem Netzlaufwerk sonst teuer machen würde.
 */

/** Bei jeder Formatänderung erhöhen: alte Dateien werden dann verworfen. */
export const CACHE_VERSION = 6;

/**
 * Zusätzlich zur Formatversion hängt der Cache an der App-Version. Ändert
 * sich der Parser durch ein Update, werden die Beiträge einmal neu gelesen —
 * ohne dass jemand daran denken muss, CACHE_VERSION zu erhöhen.
 *
 * Zur Bauzeit über next.config.ts gesetzt; in Skripten und Tests fehlt sie,
 * dann greift nur die Formatversion.
 */
const APP_VERSION = process.env.MEDIATHEK_APP_VERSION ?? "dev";

export type CachedItem = {
  fingerprint: Fingerprint;
  /** Das Item, wie es der Scan gebaut hat (Maps sind darin nicht enthalten). */
  item: Item;
};

export type LibraryCache = {
  version: number;
  appVersion: string;
  generatedAtMs: number;
  /** Passt der nicht zum aktuellen Ordner, wird alles neu gelesen. */
  libraryPath: string;
  items: Record<Slug, CachedItem>;
  topics: Record<Slug, { size: number; mtimeMs: number; topic: Topic }>;
  collections: Record<
    Slug,
    { size: number; mtimeMs: number; collection: Collection }
  >;
  questions: Record<
    Slug,
    { size: number; mtimeMs: number; question: Question }
  >;
};

export function emptyCache(): LibraryCache {
  return {
    version: CACHE_VERSION,
    appVersion: APP_VERSION,
    generatedAtMs: 0,
    libraryPath: paths.library,
    items: {},
    topics: {},
    collections: {},
    questions: {},
  };
}

/**
 * Liest den Cache. Wirft nie: kaputtes JSON, falsche Version oder ein fremder
 * Bibliothekspfad führen zu null und damit zu einem vollständigen Neuaufbau.
 */
export async function readCache(): Promise<LibraryCache | null> {
  try {
    const raw = await fs.readFile(paths.index, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as LibraryCache).version !== CACHE_VERSION
    ) {
      return null;
    }
    const cache = parsed as LibraryCache;
    if (cache.appVersion !== APP_VERSION) return null;
    if (path.resolve(cache.libraryPath) !== path.resolve(paths.library)) {
      return null;
    }
    if (!cache.items || typeof cache.items !== "object") return null;
    if (!cache.topics || typeof cache.topics !== "object") return null;
    if (!cache.collections || typeof cache.collections !== "object") {
      return null;
    }
    if (!cache.questions || typeof cache.questions !== "object") return null;
    return cache;
  } catch {
    return null;
  }
}

export type WriteCacheResult = { ok: boolean; note: string | null };

/**
 * Schreibt den Cache atomar (Zwischendatei, dann umbenennen).
 *
 * Auf einer schreibgeschützten Freigabe ist das kein Fehler, sondern ein
 * Betriebszustand: der Zuschauer darf die Bibliothek nur lesen. Dann wird der
 * Index bei jedem Serverstart neu aufgebaut, und die Einstellungsseite sagt
 * das auch.
 */
export async function writeCache(
  cache: LibraryCache,
): Promise<WriteCacheResult> {
  const temporary = `${paths.index}.tmp`;
  try {
    /*
     * Der Bibliotheksordner wird NICHT angelegt — nur ein fehlender
     * Unterordner darunter. Nachgemessen am gepackten Programm: mit
     * `recursive: true` auf den ganzen Pfad legte der Zwischenspeicher den
     * Ordner an, auf den der eingebaute Standard zeigt, und das Programm
     * hatte sich damit im eigenen Verzeichnis eine Bibliothek erfunden.
     *
     * Gibt es den Ordner nicht, gibt es auch nichts zwischenzuspeichern:
     * dann meldet der Schreibversuch ENOENT und der Index wird eben bei
     * jedem Start neu gebaut — genau wie auf einer schreibgeschützten
     * Freigabe.
     */
    const ordner = path.dirname(paths.index);
    if (path.resolve(ordner) !== path.resolve(paths.library)) {
      await fs.mkdir(ordner, { recursive: true });
    }
    await fs.writeFile(
      temporary,
      JSON.stringify({ ...cache, generatedAtMs: Date.now() }),
      "utf8",
    );
    await fs.rename(temporary, paths.index);
    return { ok: true, note: null };
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EROFS" || code === "EPERM") {
      return {
        ok: false,
        note:
          "Die Bibliothek ist nur lesbar — der Index wird bei jedem " +
          "Serverstart neu aufgebaut. Das kostet beim Start etwas Zeit, " +
          "sonst nichts.",
      };
    }
    if (code === "ENOENT") {
      return {
        ok: false,
        note:
          "Den Bibliotheksordner gibt es nicht — es wird nichts " +
          "zwischengespeichert und auch kein Ordner angelegt.",
      };
    }
    return {
      ok: false,
      note: `Der Index konnte nicht geschrieben werden: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Vergleicht zwei Fingerprints. Verglichen wird immer Größe UND Zeitstempel:
 * die mtime allein reicht nicht, weil exFAT nur 2-Sekunden-Auflösung hat und
 * SMB beim Kopieren die Zeit der Quelle übernehmen kann.
 *
 * Sind beide Werte gleich und der Inhalt trotzdem anders, hilft nur der Knopf
 * "Neu einlesen". Das ist bewusst so und in der Einstellungsseite erklärt.
 */
export function sameFingerprint(a: Fingerprint, b: Fingerprint): boolean {
  const keys = [
    "markdown",
    "media",
    "poster",
    "transcript",
    "attachments",
  ] as const;
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    if (left === null || right === null) {
      if (left !== right) return false;
      continue;
    }
    if (left.size !== right.size || left.mtimeMs !== right.mtimeMs) {
      return false;
    }
  }
  return true;
}
