"use client";

import { memo, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";

import { useActiveIndex, usePlayerStore } from "@/components/player/player-store";
import { formatTimecode } from "@/lib/library/chapters";
import type { Chapter } from "@/lib/library/types";
import { cn } from "@/lib/utils";

/**
 * Die Kapitelliste neben dem Player.
 *
 * Bei Zeitkapiteln springt ein Klick in die Wiedergabe, bei Abschnitten
 * (Textbeiträge) zum Anker im Text.
 */
export function ChapterList({ chapters }: { chapters: Chapter[] }) {
  const store = usePlayerStore();
  const starts = useMemo(
    () =>
      chapters
        .filter((chapter) => chapter.kind === "zeit")
        .map((chapter) => (chapter.kind === "zeit" ? chapter.start : 0)),
    [chapters],
  );
  const activeIndex = useActiveIndex(starts);

  if (chapters.length === 0) {
    return (
      <p className="p-4 text-sm text-schrift-2">
        Für diesen Beitrag sind keine Kapitel eingetragen. Sie stehen als
        Zeilen wie <code className="rounded bg-grund-3 px-1">01:24 Titel</code>{" "}
        in der Beschreibung — von Hand oder von Claude Code.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-rand">
      {chapters.map((chapter, index) => (
        <ChapterRow
          key={`${chapter.kind}-${index}`}
          chapter={chapter}
          active={chapter.kind === "zeit" && index === activeIndex}
          onSeek={
            chapter.kind === "zeit" && !chapter.beyondEnd
              ? () => store?.seekTo(chapter.start, { play: true })
              : null
          }
        />
      ))}
    </ol>
  );
}

/**
 * Eine Zeile, gemerkt: bei einem 90-Minuten-Beitrag mit 20 Kapiteln würde
 * sonst die ganze Liste neu rendern, sooft das aktive Kapitel wechselt.
 */
const ChapterRow = memo(function ChapterRow({
  chapter,
  active,
  onSeek,
}: {
  chapter: Chapter;
  active: boolean;
  onSeek: (() => void) | null;
}) {
  const [open, setOpen] = useState(false);

  const label =
    chapter.kind === "zeit"
      ? formatTimecode(chapter.start)
      : chapter.level === 3
        ? "—"
        : "";

  const content = (
    <>
      <span
        className={cn(
          "mt-0.5 w-14 shrink-0 text-right text-xs tabular-nums",
          active ? "text-akzent" : "text-schrift-3",
        )}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm leading-snug",
            active && "font-medium text-akzent",
            chapter.kind === "abschnitt" && chapter.level === 3 && "pl-3",
          )}
        >
          {chapter.title}
        </span>
        {chapter.kind === "zeit" && chapter.beyondEnd ? (
          <span className="mt-1 flex items-start gap-1 text-xs text-warnung">
            <AlertTriangle aria-hidden className="mt-0.5 size-3 shrink-0" />
            Diese Zeit liegt hinter dem Ende des Beitrags.
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <li className={cn(active && "bg-akzent/5")}>
      <div className="flex items-start">
        {chapter.kind === "abschnitt" ? (
          <a
            href={`#${chapter.anchor}`}
            className="flex flex-1 items-start gap-2 px-3 py-2 text-left hover:bg-grund-3"
          >
            {content}
          </a>
        ) : onSeek ? (
          <button
            type="button"
            onClick={onSeek}
            className="flex flex-1 items-start gap-2 px-3 py-2 text-left hover:bg-grund-3"
          >
            {content}
          </button>
        ) : (
          <div className="flex flex-1 items-start gap-2 px-3 py-2 text-left opacity-70">
            {content}
          </div>
        )}

        {chapter.summary ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={
              open
                ? "Zusammenfassung dieses Kapitels ausblenden"
                : "Zusammenfassung dieses Kapitels anzeigen"
            }
            className="mt-1.5 mr-2 grid size-7 shrink-0 place-items-center rounded text-schrift-3 hover:bg-grund-3 hover:text-schrift"
          >
            <ChevronDown
              aria-hidden
              className={cn("size-4 transition-transform", open && "rotate-180")}
            />
          </button>
        ) : null}
      </div>

      {open && chapter.summary ? (
        <p className="border-t border-rand bg-grund px-3 py-2 pl-[4.5rem] text-xs leading-relaxed text-schrift-2">
          {chapter.summary}
        </p>
      ) : null}
    </li>
  );
});
