import "server-only";

import { getItem } from "@/lib/library";
import { assertSlug } from "@/lib/library/slug";
import { runAssistantJob } from "./assistant-job";
import { runExtractJob } from "./extract-job";
import { runPosterJob } from "./poster-job";
import { getQueue, resetQueue } from "./queue";
import { runPythonSetupJob } from "./python-job";
import { runSearchIndexJob } from "./search-job";
import { runTranscribeJob } from "./transcribe-job";
import { isFinished } from "./types";
import type { Job, JobKind, JobSnapshot } from "./types";

/*
 * Die einzige Tür zur Auftragsschlange. Hier werden die Abläufe angemeldet,
 * damit queue.ts nichts über Whisper oder ffmpeg wissen muss.
 */

/*
 * Die Abläufe werden bei jedem Zugriff angemeldet, nicht einmalig hinter
 * einem Flag. `register` ist ein Map.set und damit billig, und ein Flag auf
 * Modulebene wäre hier falsch: die Schlange lebt auf globalThis, das Flag
 * nicht — nach einem Hot Reload oder einem Wechsel der Bibliothek stünde die
 * Schlange dann ohne Abläufe da und ein Auftrag liefe nie an.
 */
async function ensureReady() {
  const queue = getQueue();
  queue.register("transkription", runTranscribeJob);
  queue.register("kachelbild", runPosterJob);
  queue.register("anhangtext", runExtractJob);
  queue.register("kapitel", runAssistantJob);
  queue.register("bezuege", runAssistantJob);
  queue.register("fragen", runAssistantJob);
  queue.register("suchindex", runSearchIndexJob);
  queue.register("pythonsetup", runPythonSetupJob);
  await queue.load();
  return queue;
}

/**
 * Nur die Abläufe anmelden — für alles, was an `startJob` vorbei anstellt.
 *
 * Ohne das könnte ein Auftrag in einer Schlange landen, die seine Art nicht
 * kennt: sie lebt auf globalThis und überlebt einen Hot Reload, die
 * Anmeldung der Abläufe nicht.
 */
export async function prepareJobs(): Promise<void> {
  await ensureReady();
}

export type StartResult = { ok: true; job: Job } | { ok: false; error: string };

/**
 * Stellt einen Auftrag an. Läuft für denselben Beitrag schon einer derselben
 * Art, wird nichts Zweites angestellt — das ist keine Fehlermeldung, sondern
 * die Antwort auf einen doppelten Klick.
 */
export async function startJob(
  kind: JobKind,
  slugRaw: string,
): Promise<StartResult> {
  let slug: string;
  try {
    slug = assertSlug(slugRaw);
  } catch {
    return { ok: false, error: "Diese Kennung ist nicht gültig." };
  }

  const queue = await ensureReady();
  const item = await getItem(slug);
  if (!item) {
    return { ok: false, error: "Diesen Beitrag gibt es nicht." };
  }
  if (kind === "transkription" && !item.assets.mediaFile) {
    return {
      ok: false,
      error:
        item.kind === "text"
          ? "Ein Textbeitrag braucht kein Transkript — der Text ist schon da."
          : "Zu diesem Beitrag gibt es keine Mediendatei.",
    };
  }
  if (kind === "kachelbild" && item.kind === "text") {
    return {
      ok: false,
      error: "Für einen Textbeitrag gibt es kein Kachelbild.",
    };
  }
  if (kind === "anhangtext" && item.attachments.length === 0) {
    return { ok: false, error: "Dieser Beitrag hat keine Anhänge." };
  }

  const running = queue.activeFor(slug, kind);
  if (running) return { ok: true, job: running };

  return {
    ok: true,
    job: queue.enqueue({ kind, slug, title: item.title }),
  };
}

/**
 * Ein Auftrag, der die ganze Bibliothek betrifft und keinen Beitrag —
 * „Fragen zusammenfassen" ist der erste seiner Art.
 *
 * Getrennt von `startJob`, weil dort ein Beitrag nachgeschlagen und geprüft
 * wird. Ohne Beitrag gibt es nichts nachzuschlagen, und ein erfundener Slug
 * wäre genau die Abkürzung, die man hier nicht einbaut.
 */
export async function startLibraryJob(
  kind: JobKind,
  title: string,
  /**
   * Ein Kennwort statt eines Beitrags — etwa "cpu" beim Einrichten ohne
   * Grafikkarte. Bleibt leer, wo es nichts zu unterscheiden gibt.
   */
  variante = "",
): Promise<StartResult> {
  const queue = await ensureReady();
  const running = queue.activeFor(variante, kind);
  if (running) return { ok: true, job: running };
  return { ok: true, job: queue.enqueue({ kind, slug: variante, title }) };
}

export async function cancelJob(id: string): Promise<boolean> {
  const queue = await ensureReady();
  return queue.cancel(id);
}

export async function jobSnapshot(): Promise<JobSnapshot> {
  const queue = await ensureReady();
  return queue.snapshot();
}

export async function jobsForItem(slug: string): Promise<Job[]> {
  const queue = await ensureReady();
  return queue.jobsFor(slug);
}

/** Für die Ereignisverbindung: liefert die Abmeldefunktion. */
export async function subscribeJobs(
  listener: (snapshot: JobSnapshot) => void,
): Promise<() => void> {
  const queue = await ensureReady();
  // Den aktuellen Stand sofort schicken, damit ein Neuladen der Seite
  // binnen Millisekunden wieder den richtigen Fortschritt zeigt.
  listener(queue.snapshot());
  return queue.subscribe(listener);
}

/** Wirft die erledigten Aufträge aus dem Verlauf. Liefert die Anzahl. */
export async function clearFinishedJobs(): Promise<number> {
  const queue = await ensureReady();
  return queue.clearFinished();
}

/** Läuft oder wartet gerade ein Auftrag? Vor dem Wechsel der Bibliothek. */
export async function hasUnfinishedJobs(): Promise<boolean> {
  const queue = await ensureReady();
  return queue.snapshot().jobs.some((job) => !isFinished(job.state));
}

/** Beim Wechsel der Bibliothek: Verlauf und Zustandsordner gehören zur alten. */
export function resetJobs(): void {
  resetQueue();
}

export type { Job, JobKind, JobSnapshot };
