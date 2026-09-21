import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { paths } from "@/lib/paths";
import { yamlList, yamlString } from "./beitrag-md";
import { findBlocks, openMarker, closeMarker } from "./sections";
import { assertSlug, slugify } from "./slug";
import { withItemLock } from "./store";
import { writeAtomic } from "./write";
import type { SaveOutcome } from "./write";
import type { Slug } from "./types";

/*
 * Schreibzugriffe auf glossar/<slug>.md — derselbe Schutz wie bei beitrag.md
 * (atomar, unter Sperre, als eigener Schreibvorgang vermerkt), nur auf einen
 * anderen Pfad gerichtet. glossar/-Dateien haben keinen Beitragsordner, daher
 * eigene, kleine Funktionen statt einer Erweiterung von write.ts.
 */

function glossaryFile(slug: Slug): string {
  return path.join(paths.glossaryDir, `${slug}.md`);
}

export async function readGlossaryMarkdown(
  slugRaw: string,
): Promise<{ content: string; mtimeMs: number | null }> {
  const slug = assertSlug(slugRaw);
  const file = glossaryFile(slug);
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

export async function saveGlossaryMarkdown(
  slugRaw: string,
  content: string,
  expectedMtimeMs: number | null,
): Promise<SaveOutcome> {
  const slug = assertSlug(slugRaw);
  const file = glossaryFile(slug);

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
      await fs.mkdir(paths.glossaryDir, { recursive: true });
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

/**
 * Baut den Dateiinhalt aus den strukturierten Feldern des Editors. Der
 * Fundstellen-Block bleibt dabei unangetastet — replaceBlock schreibt ihn
 * unverändert zurück, falls er in `existingRaw` schon stand, sonst legt es
 * ein leeres Markerpaar an (das Schreibfenster für "Glossar sammeln").
 */
export function buildGlossaryMarkdown(input: {
  begriff: string;
  schreibweisen: readonly string[];
  description: string;
  existingRaw: string | null;
}): string {
  const head = ["---", `begriff: ${yamlString(input.begriff)}`];
  head.push(
    input.schreibweisen.length > 0
      ? `schreibweisen: ${yamlList(input.schreibweisen)}`
      : "schreibweisen: []",
  );
  head.push("---", "");

  const description = input.description.trim();
  const body = description ? `${description}\n` : "";

  let fundstellenInner = "";
  if (input.existingRaw) {
    const { blocks } = findBlocks(input.existingRaw);
    const block = blocks.get("fundstellen");
    if (block) fundstellenInner = block.inner.replace(/\s+$/, "");
  }

  const fundstellen = [
    openMarker("fundstellen"),
    ...(fundstellenInner ? [fundstellenInner] : []),
    closeMarker("fundstellen"),
    "",
  ].join("\n");

  return `${head.join("\n")}\n${body}\n${fundstellen}`;
}

export type CreateGlossaryOutcome =
  | { ok: true; slug: Slug }
  | { ok: false; error: string };

/** Case-insensitiv gegen den Ordner, nicht nur gegen den Index — wie bei Beiträgen. */
async function glossarySlugTaken(slug: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(paths.glossaryDir);
    const wanted = `${slug.toLowerCase()}.md`;
    return entries.some((entry) => entry.toLowerCase() === wanted);
  } catch {
    return false;
  }
}

/** Legt einen neuen Begriff mit leerer Definition an — der "+"-Knopf auf /glossar. */
export async function createGlossaryEntry(
  begriffRaw: string,
): Promise<CreateGlossaryOutcome> {
  const begriff = begriffRaw.trim();
  if (!begriff) {
    return { ok: false, error: "Der Begriff darf nicht leer sein." };
  }

  const slug = slugify(begriff);

  return withItemLock(slug, async () => {
    if (await glossarySlugTaken(slug)) {
      return {
        ok: false,
        error: `Es gibt bereits einen Begriff "${slug}".`,
      };
    }

    const content = buildGlossaryMarkdown({
      begriff,
      schreibweisen: [],
      description: "",
      existingRaw: null,
    });

    try {
      await fs.mkdir(paths.glossaryDir, { recursive: true });
      await writeAtomic(glossaryFile(slug), content);
      return { ok: true, slug };
    } catch (error) {
      return {
        ok: false,
        error: `Der Begriff konnte nicht angelegt werden: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  });
}
