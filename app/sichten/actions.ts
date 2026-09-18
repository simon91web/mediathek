"use server";

import path from "node:path";

import { revalidatePath } from "next/cache";

import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { collectMediaFiles } from "@/lib/import/collect";
import { parseMediaFilename } from "@/lib/import/filename";
import { importFile } from "@/lib/import/import-file";
import { startScreeningJob } from "@/lib/jobs";
import { enqueueAutoJobs } from "@/lib/jobs/auto";
import { reloadLibrary } from "@/lib/library";
import { slugTaken } from "@/lib/library/write";
import { locateFfmpeg } from "@/lib/media/locate";
import { probeMedia } from "@/lib/media/probe";
import { deleteCachedScreening, getCachedScreening } from "@/lib/screening/cache";
import { hashSourcePath } from "@/lib/screening/hash";
import type { ScreeningCandidate } from "@/lib/screening/types";
import { uniqueSlug } from "@/lib/library/slug";
import { pickFolder } from "@/lib/shell/pick-folder";

export type PickScreeningFolderResult =
  | { ok: true; dir: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string };

/** Öffnet den Ordner-Dialog des Betriebssystems, statt den Pfad tippen zu lassen. */
export async function pickScreeningFolderAction(): Promise<PickScreeningFolderResult> {
  try {
    await assertAuthorMode();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof NotAllowedError
          ? error.message
          : "Sichten ist nicht möglich.",
    };
  }
  return pickFolder();
}

export type PreviewScreeningResult =
  | { ok: true; candidates: ScreeningCandidate[] }
  | { ok: false; error: string };

/** Stellt — außer bei einem Cache-Treffer — den Sichtung-Auftrag für eine Datei an. */
async function startOne(
  sourcePath: string,
  fileName: string,
  info: ReturnType<typeof parseMediaFilename>,
  durationSec: number | null,
): Promise<{ jobId: string | null; state: ScreeningCandidate["state"] }> {
  const media = info.kind === "video" || info.kind === "audio";
  const hash = hashSourcePath(sourcePath);
  const started = await startScreeningJob({
    sourcePath,
    hash,
    title: info.title ?? fileName,
    kind: media ? "media" : "text",
    durationSec,
  });
  if (!started.ok) return { jobId: null, state: "wartet" };
  return {
    jobId: started.job.id,
    state: started.job.state === "laeuft" ? "laeuft" : "wartet",
  };
}

/**
 * Scan + Vorschau + Anstellen der Sichtung-Aufträge in einem Schritt.
 *
 * Ein Cache-Treffer (dieselbe Datei, Größe und Änderungsdatum unverändert)
 * überspringt den Auftrag komplett und liefert sein Urteil sofort — genau
 * der Fall "10 Videos gesichtet, 1 importiert", bei dem ein zweiter Blick auf
 * denselben Ordner nicht wieder alles neu transkribieren soll.
 */
export async function previewScreeningAction(
  pfad: string,
): Promise<PreviewScreeningResult> {
  try {
    await assertAuthorMode();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof NotAllowedError
          ? error.message
          : "Sichten ist nicht möglich.",
    };
  }

  const startPath = pfad.trim().replace(/^"|"$/g, "");
  if (!startPath) {
    return { ok: false, error: "Bitte einen Pfad angeben." };
  }

  const collected = await collectMediaFiles(startPath);
  if (!collected.ok) {
    return { ok: false, error: collected.error };
  }

  const ffmpeg = await locateFfmpeg();

  const candidates: ScreeningCandidate[] = [];
  for (const sourcePath of collected.files) {
    const fileName = path.basename(sourcePath);
    const info = parseMediaFilename(fileName);

    /*
     * Nur der Wurzel-Slug wird geprüft, nicht die -2/-3-Ausweichnamen, die
     * uniqueSlug bei Bedarf erzeugt — für das Duplikat-Signal reicht das:
     * es geht um "gibt es das schon", nicht um Kollisionssicherheit.
     */
    const rootTaken = await slugTaken(info.slug);
    const slugGuess = uniqueSlug(info.slug, (candidate) =>
      rootTaken ? candidate === info.slug : false,
    );

    const media = info.kind === "video" || info.kind === "audio";
    const probed = media && ffmpeg ? await probeMedia(sourcePath, ffmpeg) : null;
    const durationSec = probed?.durationSec ?? null;

    const cached = await getCachedScreening(sourcePath);

    let jobId: string | null = null;
    let state: ScreeningCandidate["state"] = "wartet";
    if (cached) {
      state = "fertig";
    } else {
      const outcome = await startOne(sourcePath, fileName, info, durationSec);
      jobId = outcome.jobId;
      state = outcome.state;
    }

    candidates.push({
      sourcePath,
      hash: hashSourcePath(sourcePath),
      fileName,
      kind: info.kind,
      titleGuess: info.title,
      slugGuess,
      slugTaken: rootTaken,
      recorded: info.recorded,
      durationSec: cached?.durationSec ?? durationSec,
      sizeBytes: probed?.sizeBytes ?? null,
      state,
      jobId,
      progress: 0,
      stageMessage: null,
      deviceUsed: null,
      speed: null,
      verdict: cached?.verdict ?? null,
      summary: cached?.summary ?? null,
      matches: cached?.matches ?? [],
      error: null,
    });
  }

  return { ok: true, candidates };
}

/**
 * Setzt pausierte Zeilen fort — dieselbe Anstell-Logik wie beim Scan, aber
 * ohne ihn zu wiederholen: Titel, Art und Dauer stehen schon fest, der
 * Client schickt sie mit.
 */
export async function resumeScreeningAction(
  input: readonly {
    sourcePath: string;
    fileName: string;
    kind: ScreeningCandidate["kind"];
    titleGuess: string | null;
    durationSec: number | null;
  }[],
): Promise<Record<string, { jobId: string | null; state: ScreeningCandidate["state"] }>> {
  try {
    await assertAuthorMode();
  } catch {
    return {};
  }

  const result: Record<
    string,
    { jobId: string | null; state: ScreeningCandidate["state"] }
  > = {};
  for (const entry of input) {
    result[entry.sourcePath] = await startOne(
      entry.sourcePath,
      entry.fileName,
      { title: entry.titleGuess, slug: "", recorded: null, kind: entry.kind },
      entry.durationSec,
    );
  }
  return result;
}

export type ScreeningResultPayload = {
  verdict: ScreeningCandidate["verdict"];
  summary: string;
  matches: ScreeningCandidate["matches"];
  durationSec: number | null;
};

/**
 * Holt das Urteil nach, sobald der Client einen Auftrag als "fertig" sieht —
 * das Urteil selbst steht nicht im `Job` (der bleibt bewusst allgemein),
 * sondern im Sichtung-eigenen Cache, den der Runner beschreibt.
 */
export async function screeningResultAction(
  sourcePath: string,
): Promise<ScreeningResultPayload | null> {
  try {
    await assertAuthorMode();
  } catch {
    return null;
  }
  const cached = await getCachedScreening(sourcePath);
  if (!cached) return null;
  return {
    verdict: cached.verdict,
    summary: cached.summary,
    matches: cached.matches,
    durationSec: cached.durationSec,
  };
}

export type ImportScreenedResult = {
  ok: boolean;
  lines: string[];
  imported: string[];
  error: string | null;
};

/**
 * Übernimmt die ausgewählten Dateien in die Bibliothek — derselbe Ablauf wie
 * beim Ordner-Import (`app/importieren/actions.ts`), nur ohne den
 * `collect()`-Schritt: welche Dateien gemeint sind, steht schon fest.
 */
export async function importScreenedAction(
  sourcePaths: readonly string[],
  move: boolean,
): Promise<ImportScreenedResult> {
  try {
    await assertAuthorMode();
  } catch (error) {
    return {
      ok: false,
      lines: [],
      imported: [],
      error:
        error instanceof NotAllowedError
          ? error.message
          : "Importieren ist nicht möglich.",
    };
  }

  if (sourcePaths.length === 0) {
    return { ok: false, lines: [], imported: [], error: "Nichts ausgewählt." };
  }

  const lines: string[] = [];
  const imported: string[] = [];

  for (const sourcePath of sourcePaths) {
    const outcome = await importFile(sourcePath, {
      move,
      originalName: path.basename(sourcePath),
    });
    if (outcome.ok) {
      imported.push(outcome.slug);
      lines.push(outcome.note);
      await deleteCachedScreening(sourcePath);
    } else {
      lines.push(outcome.error);
    }
  }

  if (imported.length > 0) {
    await reloadLibrary({ onlySlugs: imported });

    let jobs = 0;
    for (const slug of imported) {
      jobs += (await enqueueAutoJobs(slug)).length;
    }
    if (jobs > 0) {
      lines.push(
        `${jobs} ${jobs === 1 ? "Auftrag" : "Aufträge"} angestellt — ` +
          "der Fortschritt steht unter Aufträge.",
      );
    }

    revalidatePath("/", "layout");
  }

  return { ok: imported.length > 0, lines, imported, error: null };
}
