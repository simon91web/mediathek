"use server";

import { revalidatePath } from "next/cache";

import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { readSettings } from "@/lib/settings";
import { startLibraryJob } from "@/lib/jobs";
import { reloadLibrary } from "@/lib/library";
import { deleteQuestion, saveQuestion } from "@/lib/library/write-question";

/*
 * Fragen ablegen und wegräumen.
 *
 * Server Actions, keine Route Handler: Next prüft dabei Origin gegen Host,
 * und hier wird in die Bibliothek geschrieben. Der Chat selbst ist die
 * Ausnahme — er STRÖMT und braucht deshalb einen Route Handler mit eigener
 * Prüfung.
 */

export type QuestionResult =
  { ok: true; slug: string } | { ok: false; error: string };

/**
 * Legt eine beantwortete Frage in der Bibliothek ab.
 *
 * Aufgerufen vom Chat, sobald eine Antwort vollständig da ist. Schlägt es
 * fehl, ist das kein Drama für das Gespräch — die Antwort steht ja auf dem
 * Schirm; gemeldet wird es trotzdem, sonst wüsste niemand, dass der Bestand
 * nicht wächst.
 */
export async function saveQuestionAction(input: {
  question: string;
  answer: string;
  usedWeb?: boolean;
}): Promise<QuestionResult> {
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

  const outcome = await saveQuestion({
    question: input.question,
    answer: input.answer,
    usedWeb: input.usedWeb === true,
  });
  if (!outcome.ok) return outcome;

  /*
   * Sofort neu einlesen statt auf den Beobachter zu warten: wer gerade eine
   * Frage gestellt hat, klickt als Nächstes auf „Fragen" und will sie dort
   * sehen.
   */
  await reloadLibrary();
  revalidatePath("/fragen");
  return { ok: true, slug: outcome.slug };
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

/** Entfernt eine abgelegte Frage. Das Gegenstück zum Ablegen ohne Nachfrage. */
export async function deleteQuestionAction(
  slug: string,
): Promise<DeleteResult> {
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

  const outcome = await deleteQuestion(slug);
  if (!outcome.ok) {
    return { ok: false, error: outcome.error ?? "Löschen fehlgeschlagen." };
  }

  await reloadLibrary();
  revalidatePath("/fragen");
  return { ok: true };
}

export type TidyResult =
  { ok: true; message: string } | { ok: false; error: string };

/**
 * Stößt das Aufräumen an: gleichartige Fragen werden zu einem Eintrag.
 *
 * Läuft als Auftrag in der Schlange, nicht in einem Fenster — sonst müsste
 * man danebensitzen. Was dabei geschieht, steht hinterher im Protokoll des
 * Auftrags, und die Regeln stehen in `anleitungen/fragen.md`.
 */
export async function tidyQuestionsAction(): Promise<TidyResult> {
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

  const settings = await readSettings();
  if (!settings.autoAssistant) {
    return {
      ok: false,
      error:
        "Dafür müssen unbeaufsichtigte KI-Schritte eingeschaltet sein — " +
        "Einstellungen → KI-Assistent.",
    };
  }

  const started = await startLibraryJob("fragen", "Alle Fragen");
  if (!started.ok) return { ok: false, error: started.error };

  revalidatePath("/fragen");
  return {
    ok: true,
    message:
      "Das Aufräumen läuft. Der Fortschritt steht bei den Aufträgen; " +
      "danach steht hier weniger und Besseres.",
  };
}
