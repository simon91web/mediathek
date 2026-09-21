"use server";

import { revalidatePath } from "next/cache";

import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { reloadLibrary } from "@/lib/library";
import { buildGlossaryMarkdown, saveGlossaryMarkdown } from "@/lib/library/glossary-write";
import { assertSlug } from "@/lib/library/slug";

export type SaveResult =
  | { ok: true; mtimeMs: number; message: string }
  | { ok: false; kind: "konflikt"; current: string; mtimeMs: number }
  | { ok: false; kind: "fehler"; error: string };

/**
 * Speichert begriff, schreibweisen und Definition — der Fundstellen-Block
 * bleibt dabei stehen, wie er war (buildGlossaryMarkdown übernimmt ihn aus
 * der zuletzt gelesenen Fassung).
 */
export async function saveGlossaryEntryAction(
  slug: string,
  fields: { begriff: string; schreibweisen: string; description: string },
  currentRaw: string,
  expectedMtimeMs: number | null,
): Promise<SaveResult> {
  try {
    await assertAuthorMode();
    assertSlug(slug);
  } catch (error) {
    return {
      ok: false,
      kind: "fehler",
      error:
        error instanceof NotAllowedError
          ? error.message
          : "Diese Kennung ist nicht gültig.",
    };
  }

  const begriff = fields.begriff.trim();
  if (!begriff) {
    return { ok: false, kind: "fehler", error: "Der Begriff darf nicht leer sein." };
  }

  const schreibweisen = fields.schreibweisen
    .split(",")
    .map((form) => form.trim())
    .filter(Boolean);

  const content = buildGlossaryMarkdown({
    begriff,
    schreibweisen,
    description: fields.description,
    existingRaw: currentRaw,
  });

  const outcome = await saveGlossaryMarkdown(slug, content, expectedMtimeMs);

  if (outcome.ok) {
    await reloadLibrary({ onlySlugs: null });
    revalidatePath("/glossar");
    revalidatePath(`/glossar/${slug}`);
    return { ok: true, mtimeMs: outcome.mtimeMs, message: "Gespeichert." };
  }

  if (outcome.reason === "konflikt") {
    return {
      ok: false,
      kind: "konflikt",
      current: outcome.current,
      mtimeMs: outcome.mtimeMs,
    };
  }

  return { ok: false, kind: "fehler", error: outcome.message };
}
