"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  FileText,
  Hourglass,
  Link2,
  Mic,
  Play,
  Sparkles,
  Video,
  X,
} from "lucide-react";

import { AntwortText } from "@/components/fragen/antwort-text";
import { formatTimecode } from "@/lib/library/chapters";
import { formatBytes } from "@/lib/library/media-kind";
import type { MediaKind } from "@/lib/library/types";
import type { ScreeningCandidate, ScreeningVerdict } from "@/lib/screening/types";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<MediaKind, typeof Video> = {
  video: Video,
  audio: Mic,
  text: FileText,
};

const VERDICT_LABEL: Record<ScreeningVerdict, string> = {
  neu: "Neu",
  aehnlich: "Ähnliches vorhanden",
  vorhanden: "Vermutlich schon drin",
  unklar: "Unklar",
};

const VERDICT_STYLE: Record<ScreeningVerdict, string> = {
  neu: "bg-akzent/10 text-akzent-dunkel",
  aehnlich: "bg-warnung-grund text-warnung",
  vorhanden: "bg-grund-3 text-schrift-2",
  unklar: "bg-grund-3 text-schrift-2",
};

const VERDICT_ICON: Record<ScreeningVerdict, typeof Sparkles> = {
  neu: Sparkles,
  aehnlich: Link2,
  vorhanden: Copy,
  unklar: Copy,
};

export function ScreeningList({
  candidates,
  selected,
  onToggleSelect,
  onDiscard,
}: {
  candidates: readonly ScreeningCandidate[];
  selected: ReadonlySet<string>;
  onToggleSelect: (sourcePath: string) => void;
  onDiscard: (candidate: ScreeningCandidate) => void;
}) {
  return (
    <ul className="space-y-2.5">
      {candidates.map((candidate) => (
        <li key={candidate.sourcePath}>
          <ScreeningRow
            candidate={candidate}
            selected={selected.has(candidate.sourcePath)}
            onToggleSelect={() => onToggleSelect(candidate.sourcePath)}
            onDiscard={() => onDiscard(candidate)}
          />
        </li>
      ))}
    </ul>
  );
}

function ScreeningRow({
  candidate,
  selected,
  onToggleSelect,
  onDiscard,
}: {
  candidate: ScreeningCandidate;
  selected: boolean;
  onToggleSelect: () => void;
  onDiscard: () => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = candidate.kind ? KIND_ICON[candidate.kind] : FileText;
  const canExpand = candidate.state === "fertig" && candidate.verdict !== null;
  const canSelect = candidate.state === "fertig";

  return (
    <div
      className={cn(
        "rounded-xl border bg-grund-2 p-3",
        candidate.state === "fehler"
          ? "border-warnung/40"
          : candidate.state === "laeuft"
            ? "border-akzent/50"
            : "border-rand",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          disabled={!canSelect}
          onChange={onToggleSelect}
          aria-label="Für Import auswählen"
          className="size-4 shrink-0 accent-akzent disabled:opacity-40"
        />
        <Icon aria-hidden className="size-3.5 shrink-0 text-schrift-3" />
        <span
          className={cn(
            "text-sm font-medium",
            !candidate.titleGuess && "text-schrift-3 italic",
          )}
        >
          {candidate.titleGuess ?? "(ohne Titel)"}
        </span>
        <span className="font-mono text-xs text-schrift-3">
          {candidate.fileName}
          {candidate.durationSec !== null
            ? ` · ${formatTimecode(candidate.durationSec)}`
            : ""}
          {candidate.sizeBytes !== null
            ? ` · ${formatBytes(candidate.sizeBytes)}`
            : ""}
        </span>

        <span className="ml-auto flex items-center gap-2">
          <RowState candidate={candidate} />
          <button
            type="button"
            onClick={onDiscard}
            aria-label="Verwerfen"
            title="Verwerfen"
            className="text-schrift-3 hover:text-warnung"
          >
            <X aria-hidden className="size-3.5" />
          </button>
          {canExpand ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-label={open ? "Einklappen" : "Ausklappen"}
              className="text-schrift-3 hover:text-schrift"
            >
              {open ? (
                <ChevronDown aria-hidden className="size-3.5" />
              ) : (
                <ChevronRight aria-hidden className="size-3.5" />
              )}
            </button>
          ) : null}
        </span>
      </div>

      {candidate.slugTaken ? (
        <p className="mt-1.5 ml-[47px] text-xs text-schrift-2">
          Slug „{candidate.slugGuess}“ ist schon vergeben — vermutlich
          derselbe Beitrag.
        </p>
      ) : null}

      {candidate.state === "laeuft" ? (
        <>
          <div className="mt-2 ml-[47px] h-1.5 overflow-hidden rounded-full bg-grund-3">
            <div
              className="h-full rounded-full bg-akzent transition-[width] duration-500"
              style={{
                width: `${Math.max(2, Math.round(candidate.progress * 100))}%`,
              }}
            />
          </div>
          {candidate.stageMessage || candidate.deviceUsed ? (
            <p className="mt-1.5 ml-[47px] flex flex-wrap items-center gap-x-2 text-xs text-schrift-2">
              {candidate.stageMessage ? <span>{candidate.stageMessage}</span> : null}
              {candidate.deviceUsed ? (
                <span className="flex items-center gap-1">
                  ·
                  <Cpu aria-hidden className="size-3" />
                  {candidate.deviceUsed === "cuda" ? "Grafikkarte" : "CPU"}
                  {candidate.speed ? ` · ${candidate.speed.toFixed(1)}× Echtzeit` : ""}
                </span>
              ) : null}
            </p>
          ) : null}
        </>
      ) : null}

      {candidate.error ? (
        <p className="mt-1.5 ml-[47px] text-xs text-warnung">
          {candidate.error}
        </p>
      ) : null}

      {open && candidate.summary ? (
        <div className="mt-3 ml-[47px] space-y-3 border-t border-rand pt-3">
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-schrift-2 uppercase">
              Kurz-Zusammenfassung
            </p>
            {/*
             * `titles` kommt aus den eigenen Fundstellen, nicht aus dem
             * ganzen Bibliotheksindex: ein Beleg, den der Assistent zitiert,
             * ohne dass er unter den mitgegebenen Kandidaten war, bleibt
             * damit unverlinkt — wie bei den Fragen-Antworten auch.
             */}
            <AntwortText
              text={candidate.summary}
              titles={Object.fromEntries(
                candidate.matches.map((match) => [match.slug, match.title]),
              )}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RowState({ candidate }: { candidate: ScreeningCandidate }) {
  if (candidate.state === "fehler") {
    return (
      <span className="flex items-center gap-1 text-xs text-warnung">
        <AlertTriangle aria-hidden className="size-3" />
        Fehler
      </span>
    );
  }
  if (candidate.state === "laeuft") {
    return (
      <span className="flex items-center gap-1 text-xs text-akzent">
        <Play aria-hidden className="size-3" />
        läuft · {Math.round(candidate.progress * 100)} %
      </span>
    );
  }
  if (candidate.state === "wartet") {
    return (
      <span className="flex items-center gap-1 text-xs text-schrift-2">
        <Hourglass aria-hidden className="size-3" />
        wartet
      </span>
    );
  }
  if (candidate.state === "fertig" && !candidate.verdict) {
    // Transkribiert, aber noch nicht abgeglichen — der Assistent fehlt noch.
    return (
      <span className="flex items-center gap-1 text-xs text-schrift-2">
        <Check aria-hidden className="size-3" />
        transkribiert
      </span>
    );
  }
  if (candidate.verdict) {
    const Icon = VERDICT_ICON[candidate.verdict];
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          VERDICT_STYLE[candidate.verdict],
        )}
      >
        <Icon aria-hidden className="size-3" />
        {VERDICT_LABEL[candidate.verdict]}
      </span>
    );
  }
  return null;
}
