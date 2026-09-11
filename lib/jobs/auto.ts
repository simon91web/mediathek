import "server-only";

import { getFeatures } from "@/lib/features";
import { getLibrary } from "@/lib/library";
import type { Item, Slug } from "@/lib/library/types";
import { readSettings } from "@/lib/settings";
import { startJob } from "./index";
import type { JobKind } from "./types";

/*
 * Was nach einem Import von selbst passieren soll.
 *
 * Bisher musste man jeden Beitrag einzeln anklicken: transkribieren,
 * Kachelbild, Anhänge lesen. Bei zwei Fixtures geht das, bei dreißig echten
 * Aufnahmen ist es die Arbeit, für die man ein Programm hat.
 *
 * Drei Festlegungen:
 *
 * 1. **Angestellt, nicht gestartet.** Die Schlange arbeitet ohnehin seriell
 *    — eine Grafikkarte. Zwanzig Importe erzeugen also zwanzig Wartende und
 *    keine zwanzig Whisper-Läufe.
 * 2. **Nur was fehlt.** Ein vorhandenes Transkript wird nicht überschrieben;
 *    wer neu transkribieren will, sagt das am Beitrag ausdrücklich.
 * 3. **Nur was die Maschine kann.** Ohne Python kein Transkript, ohne ffmpeg
 *    kein Kachelbild. Das ist kein Fehler, sondern der Normalfall beim
 *    Zuschauer — es wird still übersprungen.
 */

/** Die Reihenfolge ist Absicht: erst das Billige, dann das Teure. */
const ORDER: readonly JobKind[] = ["kachelbild", "anhangtext", "transkription"];

function needed(item: Item, kind: JobKind): boolean {
  switch (kind) {
    case "kachelbild":
      // Textbeiträge haben keins, und ein vorhandenes bleibt.
      return item.kind !== "text" && item.assets.posterFile === null;
    case "transkription":
      return item.kind !== "text" && !item.hasTranscript;
    case "anhangtext":
      return item.attachments.some((attachment) => !attachment.hasText);
    default:
      // Die KI-Schritte gehören in die Kette, nicht in diese Automatik.
      return false;
  }
}

/**
 * Stellt für einen Beitrag alles an, was noch fehlt. Liefert die Arten, die
 * tatsächlich in die Schlange gegangen sind.
 */
export async function enqueueAutoJobs(slug: Slug): Promise<JobKind[]> {
  const settings = await readSettings();
  if (!settings.autoJobs) return [];

  /*
   * Mit eingeschalteter Kette übernimmt die: sie enthält die Transkription
   * schon und hängt Kapitel, Suche und Bezüge daran. Kachelbild und
   * Anhangtext bleiben hier — sie gehören nicht in die Reihenfolge, weil
   * nichts auf ihnen aufbaut.
   */
  if (settings.autoChain) {
    const { startChain } = await import("./chain");
    const [kette] = await Promise.all([
      startChain(slug),
      enqueueMachineJobs(slug, ["kachelbild", "anhangtext"]),
    ]);
    return kette.steps
      .filter((step) => step.state === "angestellt")
      .map((step) => step.kind);
  }

  return enqueueMachineJobs(slug, ORDER);
}

/** Die Maschinenschritte, die ohne KI auskommen. */
async function enqueueMachineJobs(
  slug: Slug,
  kinds: readonly JobKind[],
): Promise<JobKind[]> {
  const [library, features] = await Promise.all([getLibrary(), getFeatures()]);
  const item = library.bySlug.get(slug);
  if (!item) return [];

  const started: JobKind[] = [];
  for (const kind of kinds) {
    if (!needed(item, kind)) continue;

    // Ohne Werkzeug still überspringen — die Oberfläche sagt anderswo, was fehlt.
    if (kind === "kachelbild" && features.ffmpeg !== "ok") continue;
    if (kind === "transkription") {
      if (features.python !== "ok" || features.ffmpeg !== "ok") continue;
    }
    if (kind === "anhangtext" && features.python !== "ok") continue;

    const result = await startJob(kind, slug);
    if (result.ok) started.push(kind);
  }
  return started;
}

export type CatchUpResult = {
  /** Wie viele Beiträge etwas bekommen haben. */
  items: number;
  /** Wie viele Aufträge insgesamt angestellt wurden. */
  jobs: number;
  /** Was übersprungen wurde, weil ein Werkzeug fehlt. */
  skipped: string[];
};

/**
 * Dasselbe für die ganze Bibliothek — der Knopf "Alles Offene nacharbeiten".
 *
 * Gebraucht wird er in genau dem Fall, der auch der häufigste ist: es liegen
 * schon Beiträge da, die nie durch die Automatik gelaufen sind, weil sie
 * vorher importiert wurden oder weil etwas schiefging.
 */
export async function catchUpJobs(): Promise<CatchUpResult> {
  const [library, features] = await Promise.all([getLibrary(), getFeatures()]);

  const skipped: string[] = [];
  if (features.ffmpeg !== "ok") skipped.push("Kachelbilder (ffmpeg fehlt)");
  if (features.python !== "ok") {
    skipped.push("Transkription und Anhangtext (Python fehlt)");
  }

  let items = 0;
  let jobs = 0;
  for (const item of library.items) {
    /*
     * Bewusst NICHT über enqueueAutoJobs: das würde die Einstellung
     * "Automatik" mitprüfen, und dieser Knopf ist die ausdrückliche
     * Anweisung eines Menschen. Sie schlägt die Einstellung.
     */
    let forThisItem = 0;
    for (const kind of ORDER) {
      if (!needed(item, kind)) continue;
      if (kind === "kachelbild" && features.ffmpeg !== "ok") continue;
      if (kind === "transkription") {
        if (features.python !== "ok" || features.ffmpeg !== "ok") continue;
      }
      if (kind === "anhangtext" && features.python !== "ok") continue;

      const result = await startJob(kind, item.slug);
      if (result.ok) forThisItem += 1;
    }
    if (forThisItem > 0) {
      items += 1;
      jobs += forThisItem;
    }
  }

  return { items, jobs, skipped };
}
