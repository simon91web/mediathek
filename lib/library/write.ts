import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { ITEM_FILES, itemDir, itemFile, paths } from "@/lib/paths";
import { markOwnWrite, withItemLock } from "./store";
import { assertSlug } from "./slug";
import type { Slug } from "./types";

/*
 * Alle Schreibvorgänge in die Bibliothek gehen durch diese Datei.
 *
 * Drei Dinge werden dadurch garantiert:
 *   1. atomar (Zwischendatei, dann umbenennen) — ein Absturz hinterlässt
 *      niemals eine halbe beitrag.md,
 *   2. unter der Sperre des Beitrags — Editor und Import kollidieren nicht,
 *   3. als eigener Schreibvorgang vermerkt, damit der Verzeichnis-Beobachter
 *      nicht auf uns selbst reagiert und einen Rescan auslöst.
 */

/** Exportiert für alles außerhalb von beitrag.md, das denselben Schutz braucht. */
export async function writeAtomic(file: string, content: string): Promise<void> {
  const temporary = `${file}.tmp`;
  markOwnWrite(file);
  markOwnWrite(temporary);
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.writeFile(temporary, content, "utf8");
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export type SaveOutcome =
  | { ok: true; mtimeMs: number }
  /**
   * Die Datei wurde außerhalb geändert. Kein Schreibvorgang — der Aufrufer
   * entscheidet, und bekommt die fremde Fassung zum Vergleich.
   */
  | { ok: false; reason: "konflikt"; current: string; mtimeMs: number }
  | { ok: false; reason: "fehler"; message: string };

/**
 * Speichert beitrag.md.
 *
 * `expectedMtimeMs` ist der Zeitstempel, den der Editor beim Laden gesehen
 * hat. Weicht er ab, hat jemand anders geschrieben — in der Praxis Claude
 * Code, der gerade Kapitel eingetragen hat. Dann wird NICHT gespeichert.
 * Das ist der Grund, warum ein Sprachmodell überhaupt in diese Dateien
 * schreiben darf: ein Konflikt kostet nie Arbeit.
 */
export async function saveItemMarkdown(
  slugRaw: string,
  content: string,
  expectedMtimeMs: number | null,
): Promise<SaveOutcome> {
  const slug = assertSlug(slugRaw);
  const file = itemFile(slug, ITEM_FILES.markdown);

  return withItemLock(slug, async () => {
    let currentMtimeMs: number | null = null;
    try {
      const info = await fs.stat(file);
      currentMtimeMs = Math.round(info.mtimeMs);
    } catch {
      // Datei gibt es noch nicht — dann ist jeder erwartete Stempel gleich.
    }

    if (
      expectedMtimeMs !== null &&
      currentMtimeMs !== null &&
      currentMtimeMs !== expectedMtimeMs
    ) {
      return {
        ok: false,
        reason: "konflikt",
        current: await fs.readFile(file, "utf8").catch(() => ""),
        mtimeMs: currentMtimeMs,
      };
    }

    try {
      // Genau ein Zeilenumbruch am Ende: so schreiben es auch Editoren.
      await writeAtomic(file, content.replace(/\s*$/, "\n"));
      const info = await fs.stat(file);
      return { ok: true, mtimeMs: Math.round(info.mtimeMs) };
    } catch (error) {
      return {
        ok: false,
        reason: "fehler",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

/** Liest den Rohtext samt Zeitstempel — die Grundlage der Konfliktprüfung. */
export async function readItemMarkdown(
  slugRaw: string,
): Promise<{ content: string; mtimeMs: number | null }> {
  const slug = assertSlug(slugRaw);
  const file = itemFile(slug, ITEM_FILES.markdown);
  try {
    const [content, info] = await Promise.all([
      fs.readFile(file, "utf8"),
      fs.stat(file),
    ]);
    return { content, mtimeMs: Math.round(info.mtimeMs) };
  } catch {
    return { content: "", mtimeMs: null };
  }
}

export type CreateOutcome =
  | { ok: true; slug: Slug }
  | { ok: false; error: string };

/**
 * Legt einen neuen Beitragsordner mit beitrag.md an.
 *
 * Eine vorhandene beitrag.md wird NIE überschrieben: Anlegen ist idempotent,
 * ein zweiter Aufruf ergänzt nur, was fehlt.
 */
export async function createItem(
  slugRaw: string,
  markdown: string,
): Promise<CreateOutcome> {
  let slug: Slug;
  try {
    slug = assertSlug(slugRaw);
  } catch {
    return {
      ok: false,
      error:
        "Die Kennung ist nicht brauchbar. Erlaubt sind Kleinbuchstaben, " +
        "Ziffern und Bindestriche.",
    };
  }

  const dir = itemDir(slug);
  const file = itemFile(slug, ITEM_FILES.markdown);

  return withItemLock(slug, async () => {
    try {
      await fs.access(file);
      return {
        ok: false,
        error: `Es gibt bereits einen Beitrag "${slug}".`,
      };
    } catch {
      // Gut: gibt es noch nicht.
    }

    try {
      await fs.mkdir(paths.items, { recursive: true });
      await fs.mkdir(dir, { recursive: true });
      await writeAtomic(file, markdown.replace(/\s*$/, "\n"));
      return { ok: true, slug };
    } catch (error) {
      return {
        ok: false,
        error: `Der Beitrag konnte nicht angelegt werden: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  });
}

/**
 * Prüft case-insensitiv, ob eine Kennung schon belegt ist — im Dateisystem,
 * nicht nur im Index. Auf NTFS sind "Elios" und "elios" derselbe Ordner, und
 * ein Ordner kann existieren, ohne im Index zu stehen.
 */
export async function slugTaken(slug: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(paths.items);
    const wanted = slug.toLowerCase();
    return entries.some((entry) => entry.toLowerCase() === wanted);
  } catch {
    return false;
  }
}
