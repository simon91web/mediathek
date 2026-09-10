"use client";

import type { ReactNode } from "react";

import { usePlayerStore } from "@/components/player/player-store";

/**
 * Dünner Mantel um die serverseitig gerenderte Beschreibung.
 *
 * Der Parser hat Zeitmarken bereits zu Markdown-Links [01:24](#t=84)
 * umgeschrieben; hier werden die Klicks per Ereignis-Delegation abgefangen.
 *
 * Der Gewinn: react-markdown und remark-gfm bleiben komplett auf dem Server
 * und landen nicht im Client-Bündel, es gibt kein dangerouslySetInnerHTML,
 * und ohne JavaScript ist der Link nur wirkungslos statt kaputt.
 */
export function Description({ children }: { children: ReactNode }) {
  const store = usePlayerStore();

  return (
    <div
      className="prosa max-w-prose text-[15px]"
      onClick={(event) => {
        if (!store) return;
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          'a[href^="#t="]',
        );
        if (!anchor) return;
        const seconds = Number(anchor.hash.slice(3));
        if (!Number.isFinite(seconds)) return;
        event.preventDefault();
        store.seekTo(seconds, { play: true });
      }}
    >
      {children}
    </div>
  );
}
