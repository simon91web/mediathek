"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";

import { useActiveIndex, usePlayerStore } from "@/components/player/player-store";
import { formatTimecode } from "@/lib/library/chapters";
import type { Transcript, TranscriptSegment } from "@/lib/library/types";
import { cn } from "@/lib/utils";

/**
 * Das Transkript. Wird erst beim ersten Öffnen des Tabs geladen — ein
 * 90-Minuten-Beitrag hat schnell tausend Segmente, und die haben in der
 * ersten Antwort der Seite nichts zu suchen.
 */
export function TranscriptPanel({ slug }: { slug: string }) {
  const [state, setState] = useState<
    | { status: "laedt" }
    | { status: "fertig"; transcript: Transcript }
    | { status: "fehler"; message: string }
  >({ status: "laedt" });
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/transkript/${slug}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled) {
            setState({
              status: "fehler",
              message: "Für diesen Beitrag gibt es noch kein Transkript.",
            });
          }
          return;
        }
        const transcript = (await response.json()) as Transcript;
        if (!cancelled) setState({ status: "fertig", transcript });
      } catch {
        if (!cancelled) {
          setState({
            status: "fehler",
            message: "Das Transkript konnte nicht geladen werden.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.status === "laedt") {
    return <p className="p-4 text-sm text-schrift-2">Wird geladen …</p>;
  }
  if (state.status === "fehler") {
    return (
      <p className="p-4 text-sm text-schrift-2">
        {state.message} Es lässt sich über den Knopf am Beitrag erzeugen.
      </p>
    );
  }

  return (
    <TranscriptBody
      segments={state.transcript.segments}
      follow={follow}
      onFollowChange={setFollow}
    />
  );
}

function TranscriptBody({
  segments,
  follow,
  onFollowChange,
}: {
  segments: TranscriptSegment[];
  follow: boolean;
  onFollowChange: (value: boolean) => void;
}) {
  const store = usePlayerStore();
  const starts = useMemo(
    () => segments.map((segment) => segment.start),
    [segments],
  );
  const activeIndex = useActiveIndex(starts);
  const container = useRef<HTMLDivElement>(null);

  // Mitlaufen: nur das aktive Segment in Sicht halten, ohne die Seite zu bewegen.
  useEffect(() => {
    if (!follow || activeIndex < 0) return;
    const element = container.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [follow, activeIndex]);

  return (
    <div className="flex h-full flex-col">
      <label className="flex items-center gap-2 border-b border-rand px-3 py-2 text-xs text-schrift-2">
        <input
          type="checkbox"
          checked={follow}
          onChange={(event) => onFollowChange(event.target.checked)}
          className="accent-akzent"
        />
        Mitlaufen
      </label>
      <div ref={container} className="min-h-0 flex-1 overflow-y-auto">
        <ol>
          {segments.map((segment, index) => (
            <SegmentRow
              key={`${segment.start}-${index}`}
              index={index}
              segment={segment}
              active={index === activeIndex}
              onSeek={() => store?.seekTo(segment.start, { play: true })}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}

const SegmentRow = memo(function SegmentRow({
  index,
  segment,
  active,
  onSeek,
}: {
  index: number;
  segment: TranscriptSegment;
  active: boolean;
  onSeek: () => void;
}) {
  return (
    <li data-index={index}>
      <button
        type="button"
        onClick={onSeek}
        className={cn(
          "flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-grund-3",
          active && "bg-akzent/5",
        )}
      >
        <span
          className={cn(
            "mt-0.5 w-11 shrink-0 text-right text-[11px] tabular-nums",
            active ? "text-akzent" : "text-schrift-3",
          )}
        >
          {formatTimecode(segment.start)}
        </span>
        <span
          className={cn(
            "text-[13px] leading-relaxed",
            active ? "text-schrift" : "text-schrift-2",
          )}
        >
          {segment.text}
        </span>
      </button>
    </li>
  );
});
