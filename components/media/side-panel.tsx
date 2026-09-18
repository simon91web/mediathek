"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { ChapterList } from "@/components/media/chapter-list";
import { TranscriptPanel } from "@/components/media/transcript-panel";
import type { Chapter } from "@/lib/library/types";
import { cn } from "@/lib/utils";

/*
 * Das Seitenpanel neben dem Player: Kapitel, Transkript, Anhänge,
 * Zusammenfassung.
 *
 * Die Inhalte von Anhängen und Zusammenfassung werden serverseitig gerendert
 * und als children übergeben — nur die Umschaltung ist clientseitig. Das
 * Transkript ist die Ausnahme: es wird beim ersten Öffnen nachgeladen.
 */

export type PanelTab = "kapitel" | "transkript" | "anhaenge" | "zusammenfassung";

export function SidePanel({
  slug,
  chapters,
  hasTranscript,
  attachmentCount,
  attachments,
  summary,
  chaptersLabel,
}: {
  slug: string;
  chapters: Chapter[];
  hasTranscript: boolean;
  attachmentCount: number;
  attachments: ReactNode;
  summary: ReactNode;
  /** "Kapitel" bei Video und Audio, "Inhalt" bei Textbeiträgen. */
  chaptersLabel: string;
}) {
  const tabs: Array<{ id: PanelTab; label: string; badge?: number }> = [
    { id: "kapitel", label: chaptersLabel, badge: chapters.length || undefined },
  ];
  if (hasTranscript) tabs.push({ id: "transkript", label: "Transkript" });
  if (attachmentCount > 0) {
    tabs.push({ id: "anhaenge", label: "Anhänge", badge: attachmentCount });
  }
  if (summary) tabs.push({ id: "zusammenfassung", label: "Zusammenfassung" });

  const [active, setActive] = useState<PanelTab>(tabs[0]?.id ?? "kapitel");

  return (
    <div
      data-tour="kapitel"
      className="flex max-h-[calc(100dvh-8rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-rand bg-grund-2 lg:sticky lg:top-20"
    >
      <div
        role="tablist"
        aria-label="Zusatzinhalte"
        className="flex shrink-0 border-b border-rand"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              "flex-1 border-b-2 px-2 py-2.5 text-xs font-medium transition-colors",
              active === tab.id
                ? "border-akzent text-akzent"
                : "border-transparent text-schrift-2 hover:bg-grund-3 hover:text-schrift",
            )}
          >
            {tab.label}
            {tab.badge ? (
              <span className="ml-1 text-schrift-3">{tab.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {active === "kapitel" ? <ChapterList chapters={chapters} /> : null}
        {active === "transkript" ? <TranscriptPanel slug={slug} /> : null}
        {active === "anhaenge" ? attachments : null}
        {active === "zusammenfassung" ? summary : null}
      </div>
    </div>
  );
}
