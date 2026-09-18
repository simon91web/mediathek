import type { Job } from "@/lib/jobs";
import type { ScreeningCandidate } from "./types";

/**
 * Legt den Live-Stand der Transkriptions-Aufträge über die gescannte Liste.
 *
 * Reiner Client-Merge, kein Zustand für sich — dieselbe Idee wie
 * `useItemJobs` (`components/jobs/use-jobs.ts`): der globale Job-Strom wird
 * nicht verändert, nur nach den eigenen Kennungen gefiltert und übernommen.
 */
export function mergeWithJobs(
  candidates: readonly ScreeningCandidate[],
  jobs: readonly Job[],
): ScreeningCandidate[] {
  return candidates.map((candidate) => {
    if (!candidate.jobId) return candidate;
    const job = jobs.find((j) => j.id === candidate.jobId);
    if (!job) return candidate;

    if (job.state === "wartet") {
      return { ...candidate, state: "wartet" };
    }
    if (job.state === "laeuft") {
      return {
        ...candidate,
        state: "laeuft",
        progress: job.progress,
        stageMessage: job.message,
        deviceUsed: job.deviceUsed,
        speed: job.speed,
      };
    }
    if (job.state === "fertig") {
      // Verdict fehlt noch — der Abgleich (Schritt C) trägt es nach.
      return { ...candidate, state: "fertig", jobId: null };
    }
    // "fehler" oder "abgebrochen"
    return {
      ...candidate,
      state: "fehler",
      jobId: null,
      error: job.error?.message ?? "Fehlgeschlagen.",
    };
  });
}
