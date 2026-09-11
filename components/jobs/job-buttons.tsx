"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cpu, FileSearch, Image as ImageIcon, Mic, X, Zap } from "lucide-react";

import { cancelJobAction, startJobAction } from "@/app/medien/[slug]/actions";
import { useItemJobs } from "@/components/jobs/use-jobs";
import { Button } from "@/components/ui/basis";
import type { Job, JobKind } from "@/lib/jobs/types";
import { isFinished } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

/*
 * Die Knöpfe am Beitrag: transkribieren und Kachelbild erzeugen — mit
 * Fortschritt, Gerät und Abbruch.
 */

export function JobButtons({
  slug,
  kind,
  hasTranscript,
  hasPoster,
  attachmentsWithoutText,
  pythonReady,
  ffmpegReady,
}: {
  slug: string;
  kind: "video" | "audio" | "text";
  hasTranscript: boolean;
  hasPoster: boolean;
  /** Anzahl der Anhänge, aus denen noch kein Text gezogen wurde. */
  attachmentsWithoutText: number;
  pythonReady: boolean;
  ffmpegReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const jobs = useItemJobs(slug);

  const mediaButtons = kind !== "text";

  const active = jobs.find((job) => !isFinished(job.state));
  const lastTranscription = jobs.find((job) => job.kind === "transkription");

  const start = (jobKind: JobKind) => {
    setError(null);
    startTransition(async () => {
      const result = await startJobAction(jobKind, slug);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {mediaButtons ? (
          <Button
            size="klein"
            variant={hasTranscript ? "sekundaer" : "primaer"}
            disabled={
              pending || Boolean(active) || !pythonReady || !ffmpegReady
            }
            title={
              !pythonReady
                ? 'Die Python-Umgebung fehlt — einrichten mit "npm run setup:python".'
                : !ffmpegReady
                  ? "ffmpeg wurde nicht gefunden. Siehe Einstellungen."
                  : undefined
            }
            onClick={() => start("transkription")}
          >
            <Mic aria-hidden className="size-3.5" />
            {hasTranscript ? "Neu transkribieren" : "Transkribieren"}
          </Button>
        ) : null}

        {mediaButtons ? (
          <Button
            size="klein"
            disabled={pending || Boolean(active) || !ffmpegReady}
            title={
              ffmpegReady
                ? undefined
                : "ffmpeg wurde nicht gefunden. Siehe Einstellungen."
            }
            onClick={() => start("kachelbild")}
          >
            <ImageIcon aria-hidden className="size-3.5" />
            {hasPoster ? "Kachelbild neu" : "Kachelbild erzeugen"}
          </Button>
        ) : null}

        {attachmentsWithoutText > 0 ? (
          <Button
            size="klein"
            disabled={pending || Boolean(active) || !pythonReady}
            title="Zieht den Text aus PDFs, damit die Suche ihn findet."
            onClick={() => start("anhangtext")}
          >
            <FileSearch aria-hidden className="size-3.5" />
            Anhänge durchsuchbar machen
          </Button>
        ) : null}

        {!pythonReady && mediaButtons ? (
          <span className="text-xs text-schrift-2">
            Zum Transkribieren fehlt die Python-Umgebung.
          </span>
        ) : null}
      </div>

      {active ? <JobProgress job={active} /> : null}

      {!active && lastTranscription && isFinished(lastTranscription.state) ? (
        <JobResult job={lastTranscription} />
      ) : null}

      {error ? <p className="text-sm text-warnung">{error}</p> : null}
    </div>
  );
}

const STAGE_TEXT: Record<string, string> = {
  warten: "wartet",
  download: "Modell wird geladen",
  ffmpeg: "Tonspur wird gelesen",
  transcribe: "Transkription",
  write: "wird geschrieben",
  poster: "Kachelbild",
};

function formatEta(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0)
    return null;
  if (seconds < 60) return `noch ${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  return `noch etwa ${minutes} ${minutes === 1 ? "Minute" : "Minuten"}`;
}

function JobProgress({ job }: { job: Job }) {
  const [pending, startTransition] = useTransition();
  const percent = Math.round(job.progress * 100);
  const eta = formatEta(job.etaSec);

  return (
    <div className="rounded-xl border border-rand bg-grund-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {job.kind === "transkription" ? "Transkription" : "Kachelbild"}
          <span className="ml-2 font-normal text-schrift-2">
            {STAGE_TEXT[job.stage] ?? job.stage}
          </span>
        </p>
        <div className="flex items-center gap-2">
          {job.deviceUsed ? (
            <span
              className="inline-flex items-center gap-1 text-xs text-schrift-2"
              title={
                job.deviceUsed === "cuda"
                  ? "Läuft auf der Grafikkarte"
                  : "Läuft auf der CPU"
              }
            >
              {job.deviceUsed === "cuda" ? (
                <Zap aria-hidden className="size-3 text-akzent" />
              ) : (
                <Cpu aria-hidden className="size-3" />
              )}
              {job.deviceUsed === "cuda" ? "Grafikkarte" : "CPU"}
            </span>
          ) : null}
          <span className="text-xs tabular-nums text-schrift-2">
            {percent} %
          </span>
          <Button
            size="klein"
            variant="leise"
            disabled={pending}
            aria-label="Auftrag abbrechen"
            onClick={() =>
              startTransition(async () => {
                await cancelJobAction(job.id);
              })
            }
          >
            <X aria-hidden className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-grund-3">
        <div
          className={cn(
            "h-full bg-akzent transition-[width] duration-300",
            job.state === "wartet" && "animate-pulse",
          )}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>

      <p className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-schrift-2">
        <span>{job.message}</span>
        {eta ? <span>· {eta}</span> : null}
        {job.speed ? (
          <span title="Verarbeitete Medienzeit je Sekunde Rechenzeit">
            · {job.speed.toFixed(1)}-fach
          </span>
        ) : null}
      </p>
    </div>
  );
}

function JobResult({ job }: { job: Job }) {
  if (job.state === "fertig") {
    return (
      <p className="text-xs text-schrift-2">
        Zuletzt transkribiert: {job.message}
      </p>
    );
  }
  if (job.state === "abgebrochen") {
    return (
      <p className="text-xs text-schrift-2">
        Der letzte Lauf wurde abgebrochen.
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-warnung/40 bg-warnung-grund px-3 py-2">
      <p className="text-sm text-warnung">
        {job.error?.message ?? "Der letzte Lauf ist fehlgeschlagen."}
      </p>
      {job.error?.detail ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-warnung/80">
            Einzelheiten
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto text-[11px] whitespace-pre-wrap">
            {job.error.detail}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
