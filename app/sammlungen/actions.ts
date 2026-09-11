"use server";

import { revalidatePath } from "next/cache";

import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { reloadLibrary } from "@/lib/library";
import { createCollection } from "@/lib/library/write-collection";

/*
 * Sammlungen anlegen.
 *
 * Als Server Action und nicht als Route Handler: Next prüft dabei Origin
 * gegen Host. Alles, was in die Bibliothek schreibt, geht diesen Weg.
 *
 * Zwei Arten, und der Unterschied ist der Sinn der Sache:
 *
 *   Ausschnittsfolge — eine Aussage. "In dieser Reihenfolge würde ich das
 *   zeigen." Wird von Hand gefüllt und bleibt, wie sie ist.
 *
 *   Gespeicherte Suche — eine Frage. "Was gibt es dazu?" Läuft bei jedem
 *   Aufruf neu; kommt ein Beitrag dazu, steht er von selbst mit drin.
 */

export type CollectionActionResult =
  | { ok: true; slug: string; message: string }
  | { ok: false; error: string };

async function guard(): Promise<string | null> {
  try {
    await assertAuthorMode();
    return null;
  } catch (error) {
    return error instanceof NotAllowedError
      ? error.message
      : "Das ist hier nicht möglich.";
  }
}

export async function createCollectionAction(input: {
  title: string;
  description: string;
  /** Gefüllt heißt: gespeicherte Suche. Leer heißt: Ausschnittsfolge. */
  query: string;
}): Promise<CollectionActionResult> {
  const verboten = await guard();
  if (verboten) return { ok: false, error: verboten };

  const query = input.query.trim();
  const istSuche = query.length > 0;

  const result = await createCollection({
    title: input.title,
    query: istSuche ? query : null,
    description: istSuche
      ? input.description
      : /*
         * Die Ausschnittsfolge entsteht leer und wird von Hand gefüllt. Das
         * Beispiel steht als HTML-Kommentar drin: der Parser blendet
         * Kommentare aus (siehe lib/library/collections.ts), sonst wäre die
         * Beispielzeile ein echter Eintrag auf einen erfundenen Beitrag.
         */
        `${input.description.trim() || "Wofür diese Folge gut ist — zwei Sätze genügen."}\n\n` +
        "<!-- Je Zeile ein Ausschnitt; die Reihenfolge ist die Wiedergabe:\n" +
        "     - [[akku-grundlagen#00:15-00:50]] Messen mit dem Zellprüfer\n" +
        "     - [[messprotokoll-lesen#akku-und-spannung]] Und im Protokoll\n" +
        "     Diese Zeilen sind auskommentiert und zählen nicht mit. -->",
    // Eine frisch angelegte Folge ist leer — das ist beim Anlegen richtig.
    allowEmpty: !istSuche,
  });

  if (!result.ok) return { ok: false, error: result.error };

  await reloadLibrary({ force: true });
  revalidatePath("/sammlungen");
  revalidatePath("/", "layout");

  return {
    ok: true,
    slug: result.slug,
    message: istSuche
      ? `Gespeicherte Suche „${input.title.trim() || query}" angelegt.`
      : `„${input.title.trim()}" ist angelegt und noch leer. Die Ausschnitte ` +
        "kommen in die Datei — das Beispiel dafür steht schon drin.",
  };
}

/**
 * Eine Suchanfrage als Sammlung merken. Von der Suchseite aus.
 */
export async function saveSearchAction(input: {
  title: string;
  query: string;
}): Promise<CollectionActionResult> {
  const verboten = await guard();
  if (verboten) return { ok: false, error: verboten };

  const query = input.query.trim();
  if (!query) {
    return { ok: false, error: "Ohne Suchbegriff gibt es nichts zu merken." };
  }

  const result = await createCollection({
    title: input.title.trim() || query,
    query,
  });
  if (!result.ok) return { ok: false, error: result.error };

  await reloadLibrary({ force: true });
  revalidatePath("/sammlungen");
  revalidatePath("/", "layout");

  return {
    ok: true,
    slug: result.slug,
    message: `Gemerkt als Sammlung „${input.title.trim() || query}".`,
  };
}
