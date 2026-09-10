"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, ListOrdered } from "lucide-react";

import { usePlayerValue } from "@/components/player/player-store";
import { cn } from "@/lib/utils";

/*
 * Der Streifen über dem Beitrag, wenn er als Ausschnitt einer Sammlung
 * geöffnet wurde.
 *
 * Eine Sammlung spielt quer über Beiträge — dafür wird jeder Ausschnitt eine
 * eigene Seite. Am Ende eines Ausschnitts hält der Player an (der Store weiß
 * das aus "bis="), und dieser Streifen tritt hervor: von Hand weiterklicken
 * statt automatisch weiterzuspringen. Ein Sprung, den man nicht ausgelöst
 * hat, wäre in einer Wissensdatenbank Übergriffigkeit — man will oft genau
 * an der Stelle bleiben und weiterhören.
 */

export function CollectionBar({
  title,
  href,
  position,
  total,
  previousHref,
  nextHref,
  nextTitle,
}: {
  title: string;
  href: string;
  position: number;
  total: number;
  previousHref: string | null;
  nextHref: string | null;
  nextTitle: string | null;
}) {
  const reachedStop = usePlayerValue((snapshot) => snapshot.reachedStop, false);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors",
        reachedStop
          ? "border-akzent/50 bg-akzent/10"
          : "border-rand bg-grund-2",
      )}
    >
      <p className="flex min-w-0 items-center gap-2 text-sm">
        <ListOrdered aria-hidden className="size-4 shrink-0 text-schrift-3" />
        <Link href={href} className="truncate font-medium hover:text-akzent">
          {title}
        </Link>
        <span className="shrink-0 text-schrift-2 tabular-nums">
          · Ausschnitt {position} von {total}
        </span>
      </p>

      <div className="flex items-center gap-2">
        {reachedStop ? (
          <span className="text-xs text-akzent">Ausschnitt zu Ende</span>
        ) : null}
        <div className="flex gap-1.5">
          {previousHref ? (
            <Link
              href={previousHref}
              className="inline-flex items-center gap-1 rounded-md border border-rand px-2 py-1 text-xs hover:border-akzent/50 hover:text-akzent"
            >
              <ChevronLeft aria-hidden className="size-3.5" />
              Zurück
            </Link>
          ) : null}
          {nextHref ? (
            <Link
              href={nextHref}
              className={cn(
                "inline-flex max-w-56 items-center gap-1 rounded-md px-2 py-1 text-xs",
                reachedStop
                  ? "bg-akzent font-medium text-white"
                  : "border border-rand hover:border-akzent/50 hover:text-akzent",
              )}
            >
              <span className="truncate">{nextTitle ?? "Weiter"}</span>
              <ChevronRight aria-hidden className="size-3.5 shrink-0" />
            </Link>
          ) : (
            <span className="text-xs text-schrift-3">Letzter Ausschnitt</span>
          )}
        </div>
      </div>
    </div>
  );
}
