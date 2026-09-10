import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { renderItemMarkdown } from "@/lib/library/beitrag-md";
import { splitFrontmatter } from "@/lib/library/frontmatter";
import { isTextFile, isMediaFile } from "@/lib/library/media-kind";
import { uniqueSlug } from "@/lib/library/slug";
import { markOwnWrite, withItemLock } from "@/lib/library/store";
import type { Slug } from "@/lib/library/types";
import { slugTaken } from "@/lib/library/write";
import { ITEM_FILES, itemDir, paths } from "@/lib/paths";
import { parseMediaFilename } from "./filename";

/*
 * Eine Datei in die Bibliothek einsortieren.
 *
 * Kopieren ist der Standard, nicht Verschieben: die Quelldatei ist unter
 * Umständen das einzige Original. Verschoben wird nur auf ausdrücklichen
 * Wunsch.
 */

export type ImportOutcome =
  | { ok: true; slug: Slug; created: boolean; note: string }
  | { ok: false; error: string };

/** Eine schon vorhandene beitrag.md wird NIE überschrieben. */
async function ensureMarkdown(
  dir: string,
  info: ReturnType<typeof parseMediaFilename>,
): Promise<boolean> {
  const file = path.join(dir, ITEM_FILES.markdown);
  try {
    await fs.access(file);
    return false;
  } catch {
    // Gibt es noch nicht: Vorlage schreiben.
  }

  const markdown = renderItemMarkdown({
    title: info.title ?? "",
    kind: info.kind === "text" ? "text" : (info.kind ?? "video"),
    recorded: info.recorded,
  });
  markOwnWrite(file);
  await fs.writeFile(file, markdown, "utf8");
  return true;
}

/**
 * Sortiert eine Datei ein, die schon auf der Platte liegt.
 *
 * `sourceFile` muss ein Pfad im Dateisystem sein — beim Hochladen ist das die
 * fertig geschriebene Datei in `.import/`, beim Ordner-Einlesen die
 * Originaldatei.
 */
export async function importFile(
  sourceFile: string,
  options: { move: boolean; originalName?: string },
): Promise<ImportOutcome> {
  const originalName = options.originalName ?? path.basename(sourceFile);
  const info = parseMediaFilename(originalName);

  if (!info.kind) {
    return {
      ok: false,
      error:
        `"${originalName}" hat eine Endung, die die Mediathek nicht kennt. ` +
        "Erlaubt sind Video-, Audio- und Markdown-Dateien.",
    };
  }

  const taken = new Set<string>();
  if (await slugTaken(info.slug)) taken.add(info.slug);
  const slug = uniqueSlug(info.slug, (candidate) => taken.has(candidate));

  return withItemLock(slug, async () => {
    const dir = itemDir(slug);
    try {
      await fs.mkdir(paths.items, { recursive: true });
      await fs.mkdir(dir, { recursive: true });

      if (isTextFile(originalName)) {
        /*
         * Ein Textdokument WIRD die beitrag.md. Vorhandenes Frontmatter bleibt
         * erhalten; fehlt es, wird ein Kopf davorgesetzt, damit Titel und
         * Datum stimmen.
         */
        const raw = await fs.readFile(sourceFile, "utf8");
        const split = splitFrontmatter(raw);
        const target = path.join(dir, ITEM_FILES.markdown);

        let content: string;
        if (split.frontmatterText !== null) {
          // Kopf ist schon da: die Datei unverändert übernehmen.
          content = raw;
        } else {
          /*
           * Ohne Kopf einen davorsetzen. Der Titel kommt aus der ersten
           * Überschrift der Ebene 1, sonst aus dem Dateinamen — der Text
           * selbst wird nicht angetastet.
           */
          const heading = /^ {0,3}#\s+(.+?)\s*#*\s*$/m.exec(raw);
          const template = renderItemMarkdown({
            title: heading?.[1]?.trim() || info.title || "",
            kind: "text",
            recorded: info.recorded,
          });
          content = template.replace(
            /\n<!-- zusammenfassung:start -->/,
            `\n${raw.trim()}\n\n<!-- zusammenfassung:start -->`,
          );
        }

        markOwnWrite(target);
        await fs.writeFile(target, content.replace(/\s*$/, "\n"), "utf8");
        if (options.move) await fs.rm(sourceFile, { force: true });

        return {
          ok: true,
          slug,
          created: true,
          note: `Als Textbeitrag "${slug}" eingelesen.`,
        };
      }

      if (!isMediaFile(originalName)) {
        return {
          ok: false,
          error: `"${originalName}" ist keine Medien- oder Textdatei.`,
        };
      }

      // Kanonischer Name: video.<endung> bzw. audio.<endung>.
      const extension = path.extname(originalName).toLowerCase();
      const targetName = `${info.kind}${extension}`;
      const target = path.join(dir, targetName);
      markOwnWrite(target);

      if (options.move) {
        try {
          await fs.rename(sourceFile, target);
        } catch (error) {
          // Über Volumegrenzen scheitert rename: kopieren, prüfen, löschen.
          if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
          await fs.copyFile(sourceFile, target);
          const [from, to] = await Promise.all([
            fs.stat(sourceFile),
            fs.stat(target),
          ]);
          if (from.size !== to.size) {
            throw new Error(
              "Die Kopie ist nicht so groß wie das Original — " +
                "die Quelldatei bleibt liegen.",
            );
          }
          await fs.rm(sourceFile, { force: true });
        }
      } else {
        // copyFile nutzt auf Windows CopyFileEx und ist deutlich schneller
        // als ein Stream durch JavaScript.
        await fs.copyFile(sourceFile, target);
      }

      const created = await ensureMarkdown(dir, info);

      return {
        ok: true,
        slug,
        created,
        note: info.title
          ? `"${info.title}" als ${slug} eingelesen.`
          : `Als ${slug} eingelesen — der Titel fehlt noch, weil der ` +
            `Dateiname "${originalName}" keinen hergibt.`,
      };
    } catch (error) {
      return {
        ok: false,
        error: `"${originalName}" konnte nicht eingelesen werden: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  });
}

/** Räumt liegengebliebene Teilstücke aus abgebrochenen Uploads auf. */
export async function cleanIncoming(maxAgeMs = 24 * 60 * 60_000): Promise<void> {
  try {
    const entries = await fs.readdir(paths.incoming);
    const now = Date.now();
    for (const name of entries) {
      const file = path.join(paths.incoming, name);
      try {
        const info = await fs.stat(file);
        if (now - info.mtimeMs > maxAgeMs) await fs.rm(file, { force: true });
      } catch {
        // Schon weg: gut.
      }
    }
  } catch {
    // Kein .import/-Ordner: nichts aufzuräumen.
  }
}
