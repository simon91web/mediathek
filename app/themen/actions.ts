"use server";

import { revalidatePath } from "next/cache";

import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { startLibraryJob } from "@/lib/jobs";
import { readSettings } from "@/lib/settings";

/*
 * Stößt "Lücken analysieren" an — wie das Aufräumen der Fragen ein Auftrag in
 * der Schlange, kein Fenster: die ganze Bibliothek zu lesen dauert, und dafür
 * soll niemand danebensitzen müssen. Was das Werkzeug findet, steht danach in
 * `analysen/vollstaendigkeit.md` und im Protokoll des Auftrags; die Regeln
 * stehen in `anleitungen/vollstaendigkeit.md`.
 */

export type AnalyzeResult =
  { ok: true; message: string } | { ok: false; error: string };

export async function analyzeCompletenessAction(): Promise<AnalyzeResult> {
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

  const started = await startLibraryJob("vollstaendigkeit", "Vollständigkeit");
  if (!started.ok) return { ok: false, error: started.error };

  revalidatePath("/themen");
  return {
    ok: true,
    message:
      "Die Analyse läuft. Der Fortschritt steht bei den Aufträgen; danach " +
      "zeigen die Themen ihre Fachkundig-Stufe.",
  };
}
