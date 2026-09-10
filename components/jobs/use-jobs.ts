"use client";

import { useEffect, useRef, useState } from "react";

import type { Job, JobSnapshot } from "@/lib/jobs/types";

/*
 * Der Auftragsstand im Browser.
 *
 * Bevorzugt über eine Ereignisverbindung: der Browser verbindet sie von sich
 * aus neu, damit übersteht die Anzeige ein Neuladen der Seite ohne eigenen
 * Zustand. Nach zwei Fehlschlägen wird auf Abfragen umgestellt — dieselben
 * Daten, dieselbe Route, nur langsamer.
 */

const POLL_MS = 2_000;
const MAX_ERRORS = 2;

export function useJobs(): { jobs: Job[]; runningId: string | null } {
  const [snapshot, setSnapshot] = useState<JobSnapshot>({
    jobs: [],
    runningId: null,
  });
  const errors = useRef(0);

  useEffect(() => {
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const fallbackToPolling = () => {
      if (stopped || timer) return;
      const poll = async () => {
        try {
          const response = await fetch("/api/jobs", { cache: "no-store" });
          if (!response.ok) return;
          setSnapshot((await response.json()) as JobSnapshot);
        } catch {
          // Server startet gerade neu; beim nächsten Mal.
        }
      };
      void poll();
      timer = setInterval(() => void poll(), POLL_MS);
    };

    const connect = () => {
      if (stopped) return;
      source = new EventSource("/api/jobs/stream");

      source.addEventListener("snapshot", (event) => {
        errors.current = 0;
        try {
          setSnapshot(JSON.parse((event as MessageEvent).data) as JobSnapshot);
        } catch {
          // Unlesbares Ereignis überspringen.
        }
      });

      source.addEventListener("error", () => {
        errors.current += 1;
        if (errors.current >= MAX_ERRORS) {
          source?.close();
          source = null;
          fallbackToPolling();
        }
        // Darunter verbindet der Browser selbst neu.
      });
    };

    connect();

    return () => {
      stopped = true;
      source?.close();
      if (timer) clearInterval(timer);
    };
  }, []);

  return snapshot;
}

/** Die Aufträge eines Beitrags, neueste zuerst. */
export function useItemJobs(slug: string): Job[] {
  const { jobs } = useJobs();
  return jobs.filter((job) => job.slug === slug).reverse();
}
