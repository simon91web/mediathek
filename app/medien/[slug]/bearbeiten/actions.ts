"use server";

import { revalidatePath } from "next/cache";

import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { reloadLibrary } from "@/lib/library";
import { assertSlug } from "@/lib/library/slug";
import { invalidateTranscripts } from "@/lib/library/transcript";
import { saveItemMarkdown } from "@/lib/library/write";

export type SaveResult =
  | { ok: true; mtimeMs: number; message: string }
  /**
   * Jemand anders hat die Datei geändert — in der Praxis Claude Code, der
   * gerade Kapitel eingetragen hat. Es wurde NICHTS geschrieben.
   */
  | { ok: false; kind: "konflikt"; current: string; mtimeMs: number }
  | { ok: false; kind: "fehler"; error: string };

/**
 * Speichert beitrag.md.
 *
 * `expectedMtimeMs` ist der Zeitstempel, den der Editor beim Laden gesehen
 * hat. Ohne diese Prüfung könnte ein offener Editor stillschweigend
 * überschreiben, was Claude Code inzwischen geschrieben hat.
 */
export async function saveItemAction(
  slug: string,
  content: string,
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

  const outcome = await saveItemMarkdown(slug, content, expectedMtimeMs);

  if (outcome.ok) {
    /*
     * Sofort neu einlesen, damit Kapitel und Titel unmittelbar stimmen. Der
     * Verzeichnis-Beobachter würde es auch merken, ignoriert aber die eigenen
     * Schreibvorgänge — sonst löste jedes Speichern einen Rescan aus.
     */
    invalidateTranscripts([slug]);
    await reloadLibrary({ onlySlugs: [slug] });
    revalidatePath("/", "layout");
    return {
      ok: true,
      mtimeMs: outcome.mtimeMs,
      message: "Gespeichert.",
    };
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
