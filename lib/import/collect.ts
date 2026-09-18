import fs from "node:fs/promises";
import path from "node:path";

import { isMediaFile, isTextFile } from "@/lib/library/media-kind";

/*
 * Findet Video-, Audio- und Textdateien unter einem Pfad — egal ob der Pfad
 * selbst schon auf eine einzelne Datei zeigt oder auf einen Ordner, der
 * durchsucht werden muss. Ursprünglich der private Scan aus dem Import
 * (app/importieren/actions.ts); jetzt auch für die Sichtung gebraucht, die
 * denselben Fall "eine Datei, mehrere Dateien oder ein Ordner" kennt.
 */

/** Wie tief in Unterordner geschaut wird. */
export const MAX_DEPTH = 3;

/** Wie viele Dateien höchstens gesammelt werden. */
export const MAX_FILES = 200;

async function collectDir(
  dir: string,
  depth: number,
  found: string[],
): Promise<void> {
  if (depth > MAX_DEPTH || found.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (found.length >= MAX_FILES) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      await collectDir(full, depth + 1, found);
      continue;
    }
    if (!entry.isFile()) continue;
    if (isMediaFile(entry.name) || isTextFile(entry.name)) found.push(full);
  }
}

export type CollectResult =
  | { ok: true; files: string[] }
  | { ok: false; error: string };

/**
 * Sammelt Video-, Audio- und Textdateien unter `startPath`.
 *
 * Zeigt der Pfad auf eine einzelne Datei, wird — nach demselben Medien-/
 * Text-Filter — genau diese eine Datei zurückgegeben, statt einen
 * "kein Ordner"-Fehler zu melden. Ein Ordner wird wie gewohnt bis
 * `MAX_DEPTH` Ebenen tief durchsucht, bis zu `MAX_FILES` Treffer.
 */
export async function collectMediaFiles(
  startPath: string,
): Promise<CollectResult> {
  let info;
  try {
    info = await fs.stat(startPath);
  } catch {
    return {
      ok: false,
      error: `"${startPath}" ist nicht erreichbar. Bei einem Netzlaufwerk hilft der UNC-Pfad.`,
    };
  }

  if (info.isFile()) {
    const name = path.basename(startPath);
    if (!isMediaFile(name) && !isTextFile(name)) {
      return {
        ok: false,
        error: `"${startPath}" ist weder eine Video-, Audio- noch eine Markdown-Datei.`,
      };
    }
    return { ok: true, files: [startPath] };
  }

  if (!info.isDirectory()) {
    return { ok: false, error: `"${startPath}" ist weder Datei noch Ordner.` };
  }

  const files: string[] = [];
  await collectDir(startPath, 0, files);
  if (files.length === 0) {
    return {
      ok: false,
      error:
        "In diesem Ordner liegt keine Video-, Audio- oder Markdown-Datei " +
        `(bis ${MAX_DEPTH} Ebenen tief durchsucht).`,
    };
  }
  return { ok: true, files };
}
