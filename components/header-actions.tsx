"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Loader2, ListChecks } from "lucide-react";

import { useJobs } from "@/components/jobs/use-jobs";
import { isFinished } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

/*
 * Verlauf, links vom Werkzeuge-Menü (siehe components/werkzeuge/werkzeuge-menu.tsx).
 *
 * Bewusst außerhalb dieses Menüs: es ist das einzige Symbol, das sich
 * verändert — solange etwas läuft, dreht es sich und zeigt die Anzahl;
 * bleibt ein Fehler stehen, wird es zum Warndreieck. Genau das ist die
 * Frage, die man hat, während man woanders in der Mediathek arbeitet, und
 * ein Blick, der erst ein Menü öffnen müsste, würde das verstecken.
 */

export function HeaderActions({ readonly }: { readonly: boolean }) {
  const pathname = usePathname();

  if (readonly) return null;
  return <JobsIcon active={pathname.startsWith("/auftraege")} />;
}

function JobsIcon({ active }: { active: boolean }) {
  const { jobs } = useJobs();
  // Sichtung läuft explorativ und außerhalb dieser Liste — siehe job-queue.tsx.
  const offen = jobs.filter(
    (job) => !isFinished(job.state) && job.kind !== "sichtung",
  );
  // Bleibt sichtbar, bis der Verlauf geleert wird — sonst verschwindet ein
  // Fehler spurlos, sobald der letzte Auftrag durchläuft (isFinished zählt
  // "fehler" schon als fertig).
  const fehlerhaft = jobs.filter(
    (job) => job.state === "fehler" && job.kind !== "sichtung",
  );
  const laeuft = offen.find((job) => job.state === "laeuft");
  const prozent = laeuft
    ? Math.round(Math.min(1, Math.max(0, laeuft.progress)) * 100)
    : null;

  const titel =
    offen.length > 0
      ? laeuft
        ? `${laeuft.title}: ${laeuft.message || "läuft"}${
            prozent !== null ? ` (${prozent} %)` : ""
          }`
        : `${offen.length} ${offen.length === 1 ? "Auftrag wartet" : "Aufträge warten"}`
      : fehlerhaft.length > 0
        ? `${fehlerhaft.length} ${fehlerhaft.length === 1 ? "Auftrag mit Fehler" : "Aufträge mit Fehler"}`
        : "Verlauf — nichts in Arbeit";

  return (
    <Link
      href="/auftraege"
      title={titel}
      aria-label={titel}
      aria-current={active ? "page" : undefined}
      data-tour="jobs"
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-grund-3 text-schrift"
          : offen.length > 0
            ? "text-akzent hover:bg-grund-2"
            : fehlerhaft.length > 0
              ? "text-warnung hover:bg-grund-2"
              : "text-schrift-2 hover:bg-grund-2 hover:text-schrift",
      )}
    >
      {offen.length > 0 ? (
        <Loader2 aria-hidden className="size-4 animate-spin" />
      ) : fehlerhaft.length > 0 ? (
        <AlertTriangle aria-hidden className="size-4" />
      ) : (
        <ListChecks aria-hidden className="size-4" />
      )}
      {offen.length > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-akzent px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
          {offen.length}
        </span>
      ) : fehlerhaft.length > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-warnung px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
          {fehlerhaft.length}
        </span>
      ) : null}
    </Link>
  );
}
