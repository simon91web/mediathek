import "server-only";

import { getItem, reloadLibrary } from "@/lib/library";
import { locateFfmpeg } from "@/lib/media/locate";
import { makeAudioPoster, makeVideoPoster } from "@/lib/media/poster";
import { probeMedia } from "@/lib/media/probe";
import { JobError } from "./queue";
import type { JobContext } from "./queue";

/**
 * Kachelbild erzeugen — bei Video ein Einzelbild, bei Audio die Wellenform.
 *
 * Läuft in derselben Schlange wie die Transkription, obwohl es keine
 * Grafikkarte braucht: ein ffmpeg-Durchlauf während eines Whisper-Laufs
 * nimmt derselben Maschine die Rechenzeit weg.
 */
export async function runPosterJob(context: JobContext): Promise<void> {
  const { job, update, log } = context;

  const item = await getItem(job.slug);
  if (!item) {
    throw new JobError("internal", `Den Beitrag "${job.slug}" gibt es nicht.`);
  }
  if (!item.assets.mediaFile || item.kind === "text") {
    throw new JobError(
      "internal",
      "Für einen Textbeitrag gibt es kein Kachelbild.",
    );
  }

  const tools = await locateFfmpeg();
  if (!tools) {
    throw new JobError(
      "ffmpeg_missing",
      "ffmpeg wurde nicht gefunden. Den Ordner mit ffmpeg und ffprobe " +
        "unter Einstellungen eintragen.",
    );
  }

  update({ stage: "poster", progress: 0.1, message: "Datei wird gelesen …" });
  const info = await probeMedia(item.assets.mediaFile, tools);
  log(
    `Dauer ${info.durationSec ?? "?"} s, Video ${info.video?.codec ?? "—"}, ` +
      `Ton ${info.audio?.codec ?? "—"}`,
  );

  if (info.playability.ok !== true) {
    // Kein Abbruch: das Kachelbild lässt sich meist trotzdem gewinnen, und
    // der Hinweis zur Abspielbarkeit steht schon am Beitrag.
    log(`Hinweis zur Abspielbarkeit: ${info.playability.detail}`);
  }

  update({ progress: 0.3, message: "Kachelbild wird erzeugt …" });

  const result =
    item.kind === "audio"
      ? await makeAudioPoster(item.assets.mediaFile, item.assets.dir, tools)
      : await makeVideoPoster(
          item.assets.mediaFile,
          item.assets.dir,
          info.durationSec,
          tools,
        );

  if (!result.ok) {
    throw new JobError("ffmpeg_failed", result.error);
  }

  await reloadLibrary({ onlySlugs: [job.slug] });
  update({ progress: 1, message: result.note });
}
