import "server-only";

import { runAssistantTask } from "@/lib/assistant/run";
import type { AssistantTask } from "@/lib/assistant/tasks";
import { reloadLibrary } from "@/lib/library";
import { invalidateSearchIndex } from "@/lib/search";
import { JobError } from "./queue";
import type { JobContext } from "./queue";

/*
 * Ein KI-Schritt als Auftrag in der Schlange.
 *
 * Damit wird aus „Knopf drücken, Fenster beobachten, nächsten Knopf drücken"
 * eine Kette, die von selbst durchläuft. Der Preis steht in
 * lib/assistant/run.ts: niemand liest mehr mit, während geschrieben wird.
 * Deshalb geht hier JEDE Ausgabezeile ins Auftragsprotokoll.
 *
 * Fortschritt gibt es nicht — ein Sprachmodell meldet keinen. Angezeigt wird
 * stattdessen seine letzte Zeile, und das ist ehrlicher als ein Balken, der
 * eine Schätzung vortäuscht.
 */

/** Welche Auftragsart welche Anleitung ausführt. */
const TASK_OF: Record<string, AssistantTask> = {
  kapitel: "kapitel",
  bezuege: "bezuege",
  fragen: "fragen",
};

export async function runAssistantJob(context: JobContext): Promise<void> {
  const { job, update, log, setPid } = context;
  const task = TASK_OF[job.kind];
  if (!task) {
    throw new JobError("internal", `Für "${job.kind}" gibt es keine Aufgabe.`);
  }

  update({
    stage: "assistent",
    progress: 0.05,
    message: "Das Werkzeug wird gestartet …",
  });

  const result = await runAssistantTask({
    task,
    slug: job.slug || null,
    onPid: setPid,
    isCanceled: context.isCanceled,
    onLine: (line) => {
      log(line);
      /*
       * Die letzte Zeile als Meldung. Gekürzt, weil manche Werkzeuge ganze
       * Absätze ausgeben und die Auftragsliste einzeilig ist.
       */
      update({
        message: line.length > 160 ? `${line.slice(0, 159)}…` : line,
        progress: Math.min(0.9, job.progress + 0.02),
      });
    },
  });

  setPid(null);

  if (!result.ok) {
    if (context.isCanceled()) return;
    throw new JobError(
      result.error.includes("nicht gefunden") ||
        result.error.includes("nicht eingeschaltet")
        ? "assistant_missing"
        : "assistant_failed",
      result.error,
    );
  }

  /*
   * Das Werkzeug hat in die Bibliothek geschrieben — mit `force`, weil eine
   * Datei gleich groß und gleich alt zurückkommen kann, wenn nur wenige
   * Zeichen geändert wurden. Der Suchindex verfällt mit.
   */
  update({ stage: "write", progress: 0.95, message: "Wird neu eingelesen …" });
  invalidateSearchIndex();
  await reloadLibrary({ force: true });

  update({ progress: 1, message: "Fertig." });
}
