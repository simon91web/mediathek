"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Loader2,
  ListChecks,
  Mic,
  MessageSquare,
  ScanSearch,
  Settings,
  Upload,
} from "lucide-react";

import { useJobs } from "@/components/jobs/use-jobs";
import { isFinished } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

/*
 * Die Werkzeuge rechts in der Kopfzeile.
 *
 * Reihenfolge von links: Verlauf, Aufnehmen, Importieren, Suchfeld,
 * Einstellungen.
 * Alles davon war einmal ein Navigationspunkt — aber es sind keine Orte, die
 * man durchblättert, sondern Handgriffe. Als Wortliste haben sie die
 * eigentliche Navigation zugedeckt.
 *
 * Das Verlaufssymbol ist das einzige, das sich verändert: solange etwas
 * läuft, dreht es sich und zeigt die Anzahl; bleibt ein Fehler stehen, wird
 * es zum Warndreieck. Genau das ist die Frage, die man hat, während man
 * woanders in der Mediathek arbeitet.
 */

export function HeaderActions({
  authorMode,
  chatEnabled,
}: {
  authorMode: boolean;
  chatEnabled: boolean;
}) {
  const pathname = usePathname();

  return (
    <>
      {chatEnabled ? (
        <IconLink
          href="/chat"
          label="Chat"
          active={pathname.startsWith("/chat")}
        >
          <MessageSquare aria-hidden className="size-4" />
        </IconLink>
      ) : null}

      {authorMode ? (
        <>
          <JobsIcon active={pathname.startsWith("/auftraege")} />
          <IconLink
            href="/aufnehmen"
            label="Aufnehmen"
            active={pathname.startsWith("/aufnehmen")}
          >
            <Mic aria-hidden className="size-4" />
          </IconLink>
          <IconLink
            href="/importieren"
            label="Importieren"
            active={pathname.startsWith("/importieren")}
            tour="import"
          >
            <Upload aria-hidden className="size-4" />
          </IconLink>
          <IconLink
            href="/sichten"
            label="Sichten"
            active={pathname.startsWith("/sichten")}
          >
            <ScanSearch aria-hidden className="size-4" />
          </IconLink>
        </>
      ) : null}
    </>
  );
}

/** Rechts vom Suchfeld, weil es die Mediathek einrichtet und nicht bedient. */
export function SettingsIcon() {
  const pathname = usePathname();
  return (
    <IconLink
      href="/einstellungen"
      label="Einstellungen"
      active={pathname.startsWith("/einstellungen")}
      tour="settings"
    >
      <Settings aria-hidden className="size-4" />
    </IconLink>
  );
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

function IconLink({
  href,
  label,
  active,
  tour,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  /** data-tour-Attribut für den Rundgang, falls dieses Symbol ein Ziel ist. */
  tour?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      data-tour={tour}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-grund-3 text-schrift"
          : "text-schrift-2 hover:bg-grund-2 hover:text-schrift",
      )}
    >
      {children}
    </Link>
  );
}
