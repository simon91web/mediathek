"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { createGlossaryEntry } from "@/lib/library/glossary-write";
import { reloadLibrary } from "@/lib/library";

export type CreateResult = { ok: true } | { ok: false; error: string };

/**
 * Legt einen Begriff mit leerer Definition an und springt direkt in den
 * Editor — derselbe Zweischritt wie ein neuer Beitrag: anlegen, dann
 * ausfüllen.
 */
export async function createGlossaryEntryAction(
  formData: FormData,
): Promise<CreateResult> {
  try {
    await assertAuthorMode();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof NotAllowedError
          ? error.message
          : "Das ist hier nicht möglich.",
    };
  }

  const begriff = String(formData.get("begriff") ?? "");
  const outcome = await createGlossaryEntry(begriff);
  if (!outcome.ok) return { ok: false, error: outcome.error };

  await reloadLibrary();
  revalidatePath("/glossar");
  redirect(`/glossar/${outcome.slug}/bearbeiten`);
}
