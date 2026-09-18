import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { getItem } from "@/lib/library";
import { findWikilinks } from "@/lib/library/wikilink";
import type { JobContext } from "@/lib/jobs/queue";
import { JobError } from "@/lib/jobs/queue";
import { getQueue } from "@/lib/jobs/queue";
import { findPythonEnv } from "@/lib/jobs/python";
import { runOnce } from "@/lib/jobs/transcribe-job";
import { locateFfmpeg } from "@/lib/media/locate";
import { paths } from "@/lib/paths";
import { libraryStateDir, readSettings } from "@/lib/settings";
import { setCachedScreening } from "./cache";
import { judgeScreening } from "./judge";
import { findSearchCandidates } from "./search-context";
import type { ScreeningMatch, ScreeningVerdict } from "./types";

/*
 * Die Sichtung für eine Datei, die noch NICHT in der Bibliothek steckt.
 *
 * Zwei Teile, ein Auftrag: erst an einen Text kommen (Whisper bei Video/
 * Audio, ein einfaches Lesen bei Text), dann der Abgleich (Suchindex-
 * Kandidaten + ein Urteil vom Assistenten). Getrennt in zwei Aufträge hätte
 * keinen Vorteil — die Zeile auf /sichten zeigt ohnehin nur einen
 * Fortschrittsbalken je Datei.
 *
 * Bewusst kein `getItem`, kein `markOwnWrite`, kein `reloadLibrary` für die
 * Quelldatei selbst — die gibt es als Beitrag noch nicht.
 */

const MAX_EXCERPT_CHARS = 8_000;

/** Wohin die Sichtung für eine Datei schreibt — deterministisch aus ihrem Pfad. */
export function screeningDir(hash: string): string {
  return path.join(libraryStateDir(), "screening", hash);
}

async function buildHotwords(workDir: string): Promise<string | null> {
  let glossary: string;
  try {
    glossary = await fs.readFile(paths.glossary, "utf8");
  } catch {
    return null;
  }
  const terms = glossary
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (terms.length === 0) return null;

  const file = path.join(workDir, "glossar.txt");
  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(file, terms.join(", "), "utf8");
  return file;
}

type TranscriptJson = { segments?: { text?: unknown }[] };

async function readTranscriptText(outDir: string): Promise<string> {
  const raw = await fs.readFile(path.join(outDir, "transcript.json"), "utf8");
  const parsed = JSON.parse(raw) as TranscriptJson;
  return (parsed.segments ?? [])
    .map((segment) => String(segment.text ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** Belege, die der Assistent tatsächlich zitiert hat — nur echte Beiträge. */
async function resolveMatches(judgeText: string): Promise<ScreeningMatch[]> {
  const matches: ScreeningMatch[] = [];
  const seen = new Set<string>();
  for (const link of findWikilinks(judgeText)) {
    if (seen.has(link.slug)) continue;
    seen.add(link.slug);
    const item = await getItem(link.slug);
    if (!item) continue;
    matches.push({ slug: link.slug, title: item.title || link.slug, raw: link.raw });
  }
  return matches;
}

async function transcribeToText(
  context: JobContext,
  sourcePath: string,
  outDir: string,
): Promise<string> {
  const python = await findPythonEnv();
  if (!python) {
    throw new JobError(
      "python_missing",
      "Die Python-Umgebung für die Transkription fehlt. Einzurichten unter " +
        "Einstellungen → Verarbeitung.",
    );
  }
  const tools = await locateFfmpeg();
  if (!tools) {
    throw new JobError(
      "ffmpeg_missing",
      "ffmpeg wurde nicht gefunden — es liest die Tonspur. Den Ordner mit " +
        "ffmpeg.exe und ffprobe.exe unter Einstellungen eintragen.",
    );
  }

  const settings = await readSettings();
  const workDir = path.join(outDir, "_work");
  const hotwordsFile = await buildHotwords(workDir);

  const outcome = await runOnce({
    context,
    python,
    tools,
    mediaFile: sourcePath,
    outDir,
    workDir,
    hotwordsFile,
    device: "auto",
    model: settings.whisperModel,
    language: settings.whisperLanguage,
  });

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

  if (!outcome.ok) {
    throw new JobError(outcome.code, outcome.message, outcome.detail);
  }
  return readTranscriptText(outDir);
}

export async function runScreeningJob(context: JobContext): Promise<void> {
  const { job, update } = context;
  const payload = getQueue().payloadOf(job.id);
  const sourcePath = String(payload.sourcePath ?? "");
  const hash = String(payload.hash ?? "");
  const kind = payload.kind === "text" ? "text" : "media";
  if (!sourcePath || !hash) {
    throw new JobError("internal", "Der Sichtung fehlt der Quellpfad.");
  }

  const outDir = screeningDir(hash);
  await fs.mkdir(outDir, { recursive: true });

  const transcriptText =
    kind === "text"
      ? (await fs.readFile(sourcePath, "utf8")).trim()
      : await transcribeToText(context, sourcePath, outDir);

  if (!transcriptText) {
    throw new JobError("internal", "Es wurde kein Text erkannt.");
  }

  update({ progress: 0.85, stage: "abgleich", message: "Wird abgeglichen …" });

  const excerpt = transcriptText.slice(0, MAX_EXCERPT_CHARS);
  const searchCandidates = await findSearchCandidates(excerpt);
  const judged = await judgeScreening(excerpt, searchCandidates);

  const verdict: ScreeningVerdict = judged.ok ? judged.verdict : "unklar";
  const summary = judged.ok
    ? judged.text
    : `Einschätzung nicht möglich — ${judged.error}`;
  const matches = judged.ok ? await resolveMatches(judged.text) : [];

  await setCachedScreening(sourcePath, {
    durationSec:
      typeof payload.durationSec === "number" ? payload.durationSec : null,
    transcriptExcerpt: excerpt,
    verdict,
    summary,
    matches,
  });

  update({
    progress: 1,
    stage: "write",
    message:
      judged.ok
        ? "Abgeglichen."
        : "Transkribiert — Abgleich mit dem Assistenten nicht möglich.",
  });
}
