"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Cpu,
  FileSearch,
  Hourglass,
  Image as ImageIcon,
  Link2,
  ListOrdered,
  MessagesSquare,
  Mic,
  PackagePlus,
  Play,
  Radar,
  ScanSearch,
  Search,
  Wand2,
  X,
  Zap,
} from "lucide-react";

import { cancelJobAction } from "@/app/medien/[slug]/actions";
import {
  catchUpJobsAction,
  chainAllAction,
  clearFinishedJobsAction,
} from "@/app/auftraege/actions";
import { useJobs } from "@/components/jobs/use-jobs";
import { Button, Leer } from "@/components/ui/basis";
import type { Job, JobKind, JobState } from "@/lib/jobs/types";
import { isAssistantKind, isFinished, KIND_LABEL } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

/*
 * Die Warteliste.
 *
 * Ein Auftrag kann eine Viertelstunde dauern; ohne diese Seite weiß man
 * nicht, ob noch etwas passiert oder ob etwas hängt. Der Stand kommt über
 * dieselbe Ereignisverbindung wie am Beitrag (useJobs) — also auch nach
 * einem Neuladen binnen Millisekunden wieder da.
 */

const KIND_ICON: Record<JobKind, typeof Mic> = {
  transkription: Mic,
  kachelbild: ImageIcon,
  anhangtext: FileSearch,
  kapitel: ListOrdered,
  suchindex: Search,
  bezuege: Link2,
  fragen: MessagesSquare,
  vollstaendigkeit: Radar,
  pythonsetup: PackagePlus,
  sichtung: ScanSearch,
};

const STATE_LABEL: Record<JobState, string> = {
  wartet: "wartet",
  laeuft: "läuft",
  fertig: "fertig",
  fehler: "Fehler",
  abgebrochen: "abgebrochen",
};

function formatEta(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0)
    return null;
  if (seconds < 60) return `noch ${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  return `noch etwa ${minutes} ${minutes === 1 ? "Minute" : "Minuten"}`;
}

/** mm:ss, ab einer Stunde h:mm:ss. */
function formatDauer(seconds: number): string {
  const gesamt = Math.max(0, Math.floor(seconds));
  const stunden = Math.floor(gesamt / 3600);
  const minuten = Math.floor(gesamt / 60) % 60;
  const sekunden = gesamt % 60;
  const rest = `${String(minuten).padStart(stunden > 0 ? 2 : 1, "0")}:${String(sekunden).padStart(2, "0")}`;
  return stunden > 0 ? `${stunden}:${rest}` : rest;
}

/**
 * Der laufende oder nächste Schritt eines Stapels ("Alles erschließen") —
 * für die Sammel-Anzeige oben in der Liste. `index`/`total` kommen direkt
 * aus dem Auftrag, keine eigene Zählung: sonst könnten beide Zahlen
 * widersprechen.
 */
function aktiverStapel(
  jobs: Job[],
): { index: number; total: number; title: string; laeuft: boolean } | null {
  const laufend = jobs.find((job) => job.state === "laeuft" && job.batch);
  if (laufend?.batch) {
    return {
      index: laufend.batch.index,
      total: laufend.batch.total,
      title: laufend.title,
      laeuft: true,
    };
  }
  const wartend = [...jobs]
    .filter((job) => job.state === "wartet" && job.batch)
    .sort((a, b) => a.batch!.index - b.batch!.index)[0];
  if (wartend?.batch) {
    return {
      index: wartend.batch.index,
      total: wartend.batch.total,
      title: wartend.title,
      laeuft: false,
    };
  }
  return null;
}

export function JobQueue() {
  const router = useRouter();
  const { jobs, runningId } = useJobs();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  /*
   * Sichtung-Aufträge laufen zwar in derselben Schlange (eine Grafikkarte),
   * gehören aber nicht in diese Liste: sie sind rein explorativ, oft nie
   * importiert, und die eigene Fortschrittsanzeige steht schon auf /sichten.
   */
  const sichtbar = jobs.filter((job) => job.kind !== "sichtung");

  // Neueste zuerst, aber Laufende und Wartende immer oben.
  const open = sichtbar.filter((job) => !isFinished(job.state));
  const done = [...sichtbar].reverse().filter((job) => isFinished(job.state));
  const stapel = aktiverStapel(open);

  const lauf = (
    aktion: () => Promise<{ ok: boolean; message?: string; error?: string }>,
  ) => {
    setNote(null);
    startTransition(async () => {
      const result = await aktion();
      setNote(
        result.ok
          ? (result.message ?? "Fertig.")
          : (result.error ?? "Fehlgeschlagen."),
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primaer"
            disabled={pending}
            onClick={() => lauf(chainAllAction)}
          >
            <Wand2 aria-hidden className="size-4" />
            Alles erschließen
          </Button>
          <p className="text-xs text-schrift-2">
            Die ganze Kette für jeden Beitrag, dem etwas fehlt: Transkription →
            Kapitel → Suche → Bezüge. Das kann Stunden laufen und arbeitet einen
            Beitrag nach dem anderen ab.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="sekundaer"
            size="klein"
            disabled={pending}
            onClick={() => lauf(catchUpJobsAction)}
          >
            <Zap aria-hidden className="size-3.5" />
            Nur die Maschinenschritte
          </Button>
          <p className="text-xs text-schrift-2">
            Kachelbild, Transkript, Text aus Anhängen — ohne KI und ohne Kosten.
          </p>
        </div>
      </div>
      {stapel ? (
        <div className="rounded-xl border border-rand bg-grund-2 p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <Wand2 aria-hidden className="size-3.5 text-akzent" />
            <span className="font-medium">Alles erschließen läuft</span>
            <span className="ml-auto text-xs text-schrift-2 tabular-nums">
              Beitrag {stapel.index} von {stapel.total}
            </span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-grund-3">
            <div
              className="h-full rounded-full bg-akzent transition-[width] duration-500"
              style={{
                width: `${Math.round(((stapel.index - 1) / stapel.total) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1.5 text-xs text-schrift-2">
            {stapel.index - 1} von {stapel.total} Beiträgen fertig
            {stapel.laeuft ? ` · ${stapel.title} läuft` : ""}
          </p>
        </div>
      ) : null}

      {note ? <p className="text-sm text-akzent">{note}</p> : null}

      {open.length === 0 && done.length === 0 ? (
        <Leer titel="Nichts in der Warteliste">
          Nach einem Import läuft das von selbst an — Kachelbild, Transkript,
          Text aus Anhängen. Hier ist dann zu sehen, wie weit es ist.
        </Leer>
      ) : null}

      {open.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-schrift-2 uppercase">
            In Arbeit ({open.length})
          </h2>
          <ul className="space-y-2">
            {open.map((job) => (
              <li key={job.id}>
                <JobRow job={job} running={job.id === runningId} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {done.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-schrift-2 uppercase">
              Erledigt
            </h2>
            <Button
              size="klein"
              variant="leise"
              disabled={pending}
              onClick={() => lauf(clearFinishedJobsAction)}
            >
              Leeren
            </Button>
          </div>
          <ul className="space-y-2">
            {done.slice(0, 30).map((job) => (
              <li key={job.id}>
                <JobRow job={job} running={false} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function JobRow({ job, running }: { job: Job; running: boolean }) {
  const [pending, startTransition] = useTransition();
  const Icon = KIND_ICON[job.kind];
  const eta = formatEta(job.etaSec);
  const percent = Math.round(Math.min(1, Math.max(0, job.progress)) * 100);

  /*
   * Ein KI-Schritt (Kapitel, Bezüge, …) meldet keinen Fortschritt — der
   * Prozentsatz stünde die ganze Laufzeit bei den 5 % des Starts. Eine
   * tickende Laufzeit ist dagegen ein echter, zählbarer Wert.
   */
  const ohneFortschritt = job.state === "laeuft" && isAssistantKind(job.kind);
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    if (!ohneFortschritt || !job.startedAt) return;
    const id = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ohneFortschritt, job.startedAt]);
  const laufzeit =
    ohneFortschritt && job.startedAt
      ? formatDauer((jetzt - new Date(job.startedAt).getTime()) / 1000)
      : null;

  return (
    <div
      className={cn(
        "rounded-xl border bg-grund-2 p-3",
        job.state === "fehler"
          ? "border-warnung/40"
          : running
            ? "border-akzent/50"
            : "border-rand",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Icon aria-hidden className="size-3.5 shrink-0 text-schrift-3" />
        <Link
          href={`/medien/${job.slug}`}
          className="font-medium hover:text-akzent"
        >
          {job.title}
        </Link>
        <span className="text-xs text-schrift-3">{KIND_LABEL[job.kind]}</span>

        <span
          className={cn(
            "ml-auto flex items-center gap-1 text-xs",
            job.state === "fehler"
              ? "text-warnung"
              : job.state === "fertig"
                ? "text-akzent"
                : "text-schrift-2",
          )}
        >
          {job.state === "wartet" ? (
            <Hourglass aria-hidden className="size-3" />
          ) : job.state === "laeuft" ? (
            <Play aria-hidden className="size-3" />
          ) : job.state === "fertig" ? (
            <Check aria-hidden className="size-3" />
          ) : job.state === "fehler" ? (
            <AlertTriangle aria-hidden className="size-3" />
          ) : (
            <X aria-hidden className="size-3" />
          )}
          {STATE_LABEL[job.state]}
          {laufzeit
            ? ` · seit ${laufzeit}`
            : job.state === "laeuft"
              ? ` · ${percent} %`
              : ""}
        </span>
      </div>

      {job.state === "laeuft" ? (
        <div
          className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-grund-3"
          role="progressbar"
          aria-valuenow={ohneFortschritt ? undefined : percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${KIND_LABEL[job.kind]}${job.slug ? ` von ${job.title}` : ""}`}
        >
          {ohneFortschritt ? (
            <div className="balken-unbestimmt h-full w-[35%] rounded-full bg-akzent" />
          ) : (
            <div
              className="h-full rounded-full bg-akzent transition-[width] duration-500"
              style={{ width: `${Math.max(2, percent)}%` }}
            />
          )}
        </div>
      ) : null}

      {job.message || eta || job.deviceUsed ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-schrift-2">
          {job.message ? <span>{job.message}</span> : null}
          {eta ? <span>· {eta}</span> : null}
          {job.deviceUsed ? (
            <span className="flex items-center gap-1">
              ·
              <Cpu aria-hidden className="size-3" />
              {job.deviceUsed === "cuda" ? "Grafikkarte" : "CPU"}
              {job.speed ? ` · ${job.speed.toFixed(1)}× Echtzeit` : ""}
            </span>
          ) : null}
        </p>
      ) : null}

      {job.error ? (
        <p className="mt-1.5 text-xs text-warnung">
          {job.error.message}
          {job.fallbackReason ? ` (${job.fallbackReason})` : ""}
        </p>
      ) : null}

      {!isFinished(job.state) ? (
        <div className="mt-2">
          <Button
            size="klein"
            variant="leise"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await cancelJobAction(job.id);
              })
            }
          >
            <X aria-hidden className="size-3.5" />
            Abbrechen
          </Button>
        </div>
      ) : null}
    </div>
  );
}
