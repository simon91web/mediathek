"use client";

import Link from "next/link";

import { usePlayerStore } from "@/components/player/player-store";
import { formatTimecode } from "@/lib/library/chapters";
import type { LinkTarget, Slug } from "@/lib/library/types";

/*
 * "Themen in diesem Beitrag".
 *
 * Abgeleitet aus den Fundstellen der Themenseiten — hier wird nichts
 * zweitgeschrieben. Wer an einem Beitrag arbeitet, sieht damit, in welche
 * Wissensgebiete er eingeordnet ist, und springt von hier an genau die
 * Stellen, um die es dort geht.
 *
 * Client-Komponente, weil ein Klick innerhalb des laufenden Beitrags
 * springen soll, statt die Seite neu zu laden. Ohne JavaScript bleibt es ein
 * gewöhnlicher Link mit "?t=" — wirkungslos ist er nie.
 */

export type TopicSpotGroup = {
  topic: { slug: Slug; title: string };
  spots: Array<{ target: LinkTarget; note: string }>;
};

export function TopicSpots({
  slug,
  groups,
}: {
  slug: Slug;
  groups: readonly TopicSpotGroup[];
}) {
  const store = usePlayerStore();
  if (groups.length === 0) return null;

  return (
    <section
      aria-labelledby="themen-in-diesem-beitrag"
      className="rounded-xl border border-rand bg-grund-2 px-3 py-2.5"
    >
      <p
        id="themen-in-diesem-beitrag"
        className="text-xs tracking-wide text-schrift-3 uppercase"
      >
        Themen in diesem Beitrag
      </p>
      <ul className="mt-2 space-y-1.5">
        {groups.map((group) => (
          <li
            key={group.topic.slug}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm"
          >
            <Link
              href={`/themen/${group.topic.slug}`}
              className="font-medium hover:text-akzent"
            >
              {group.topic.title}
            </Link>
            {group.spots.map((spot, index) => {
              /*
               * In den eigenen Konstanten festhalten: in einer Closure hält
               * TypeScript die Verengung über spot.target.kind nicht, weil
               * das Feld dazwischen theoretisch ein anderes sein könnte.
               */
              const target = spot.target;
              const start = target.kind === "zeit" ? target.start : null;
              return (
                <SpotLink
                  key={index}
                  slug={slug}
                  target={target}
                  note={spot.note}
                  onSeek={
                    start !== null && store
                      ? () => store.seekTo(start, { play: true })
                      : null
                  }
                />
              );
            })}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SpotLink({
  slug,
  target,
  note,
  onSeek,
}: {
  slug: Slug;
  target: LinkTarget;
  note: string;
  onSeek: (() => void) | null;
}) {
  const label =
    target.kind === "zeit"
      ? formatTimecode(target.start)
      : target.kind === "abschnitt"
        ? `#${target.anchor}`
        : "ganz";

  const className =
    "rounded bg-akzent/10 px-1.5 py-0.5 text-xs font-medium text-akzent " +
    "tabular-nums hover:bg-akzent/20";

  const href =
    target.kind === "zeit"
      ? `/medien/${slug}?t=${target.start}`
      : target.kind === "abschnitt"
        ? `/medien/${slug}#${target.anchor}`
        : `/medien/${slug}`;

  if (onSeek) {
    return (
      <button
        type="button"
        title={note || undefined}
        onClick={onSeek}
        className={className}
      >
        {label}
      </button>
    );
  }

  return (
    <Link href={href} title={note || undefined} className={className}>
      {label}
    </Link>
  );
}
