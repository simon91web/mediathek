"use server";

import { revalidatePath } from "next/cache";

import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { reloadLibrary } from "@/lib/library";
import { renderItemMarkdown } from "@/lib/library/beitrag-md";
import { slugify, uniqueSlug } from "@/lib/library/slug";
import type { MediaKind } from "@/lib/library/types";
import { createItem, slugTaken } from "@/lib/library/write";

export type CreateResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

/**
 * Legt einen neuen Beitrag an.
 *
 * Für Textbeiträge ist das der Hauptweg. Für Video und Audio ist es der
 * Nachtrag zu einer Datei, die schon im Ordner liegt — die Mediendatei selbst
 * wird nicht hier, sondern beim Import einsortiert.
 */
export async function createItemAction(input: {
  title: string;
  slug?: string;
  kind: MediaKind;
  tags?: string;
}): Promise<CreateResult> {
  try {
    await assertAuthorMode();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof NotAllowedError
          ? error.message
          : "Anlegen ist nicht möglich.",
    };
  }

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Bitte einen Titel angeben." };

  const wanted = input.slug?.trim() ? slugify(input.slug) : slugify(title);
  /*
   * Kollisionen werden case-insensitiv UND gegen das Dateisystem geprüft: auf
   * NTFS sind "Elios" und "elios" derselbe Ordner, und ein Ordner kann
   * existieren, ohne im Index zu stehen (kaputte Datei, laufender Scan).
   */
  const taken = new Set<string>();
  if (await slugTaken(wanted)) taken.add(wanted);
  const slug = uniqueSlug(wanted, (candidate) => taken.has(candidate));

  const tags = (input.tags ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean);

  const markdown = renderItemMarkdown({
    title,
    kind: input.kind,
    recorded: new Date().toISOString().slice(0, 10),
    tags,
  });

  const created = await createItem(slug, markdown);
  if (!created.ok) return { ok: false, error: created.error };

  await reloadLibrary({ onlySlugs: [created.slug] });
  revalidatePath("/", "layout");
  return { ok: true, slug: created.slug };
}
