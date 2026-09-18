import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { libraryStateDir } from "@/lib/settings";
import type { ScreeningMatch, ScreeningVerdict } from "./types";

/*
 * Ergebnisse einer Sichtung, pro Datei — maschinenlokal, damit ein zweiter
 * Blick auf denselben Ordner nicht alles neu transkribiert. Schlüssel ist
 * der absolute Quellpfad; ein Eintrag gilt nur, solange Größe und
 * Änderungsdatum der Datei noch zu ihm passen.
 *
 * Der Schreibzugriff ist unkritisch: die Job-Queue ist seriell, also
 * schreibt hier nie mehr als ein Lauf gleichzeitig.
 */

export type CacheEntry = {
  size: number;
  mtimeMs: number;
  durationSec: number | null;
  transcriptExcerpt: string;
  verdict: ScreeningVerdict;
  summary: string;
  matches: ScreeningMatch[];
  checkedAt: string;
};

type CacheFile = Record<string, CacheEntry>;

function cacheFile(): string {
  return path.join(libraryStateDir(), "screening-cache.json");
}

async function readCache(): Promise<CacheFile> {
  try {
    const raw = await fs.readFile(cacheFile(), "utf8");
    return JSON.parse(raw) as CacheFile;
  } catch {
    return {};
  }
}

async function writeCache(data: CacheFile): Promise<void> {
  const file = cacheFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data), "utf8");
  await fs.rename(tmp, file);
}

/** `null`, wenn es keinen Eintrag gibt oder die Datei sich seither geändert hat. */
export async function getCachedScreening(
  sourcePath: string,
): Promise<CacheEntry | null> {
  const cache = await readCache();
  const entry = cache[sourcePath];
  if (!entry) return null;

  try {
    const stat = await fs.stat(sourcePath);
    if (stat.size !== entry.size || stat.mtimeMs !== entry.mtimeMs) return null;
  } catch {
    return null;
  }
  return entry;
}

export async function setCachedScreening(
  sourcePath: string,
  entry: Omit<CacheEntry, "size" | "mtimeMs" | "checkedAt">,
): Promise<void> {
  const stat = await fs.stat(sourcePath);
  const cache = await readCache();
  cache[sourcePath] = {
    ...entry,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    checkedAt: new Date().toISOString(),
  };
  await writeCache(cache);
}

/**
 * Nach einem Import: die Quelldatei bleibt bei "kopieren" auf der Platte
 * liegen und würde bei einem erneuten Scan sonst wieder als "Neu" auftauchen
 * — mit einem Urteil, das nichts mehr vom frischen Duplikat-Signal
 * (`slugTaken`) weiß. Der Cache-Eintrag ist jetzt ohnehin überholt.
 */
export async function deleteCachedScreening(sourcePath: string): Promise<void> {
  const cache = await readCache();
  if (!(sourcePath in cache)) return;
  delete cache[sourcePath];
  await writeCache(cache);
}
