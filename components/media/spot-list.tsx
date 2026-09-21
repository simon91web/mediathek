import Link from "next/link";
import { AudioLines, FileText, Film, Play } from "lucide-react";

import { formatTimecode } from "@/lib/library/chapters";
import type { Item, LinkTarget, Slug, Spot } from "@/lib/library/types";
import { posterUrl } from "@/lib/library/urls";
import { referenceHref } from "@/lib/library/wikilink";

/*
 * Eine geordnete Liste von Fundstellen — "dynamische Kapitel über
 * Beitragsgrenzen hinweg".
 *
 * Dieselbe Darstellung trägt die Fundstellen einer Themenseite und die
 * Ausschnitte einer Sammlung: es ist derselbe Gegenstand, nur einmal
 * gefunden und einmal ausgewählt.
 */

const KIND_ICON = { video: Film, audio: AudioLines, text: FileText } as const;

export function describeTarget(target: LinkTarget): string | null {
  if (target.kind === "zeit") {
    return target.end === null
      ? formatTimecode(target.start)
      : `${formatTimecode(target.start)}–${formatTimecode(target.end)}`;
  }
  if (target.kind === "abschnitt") return `Abschnitt „${target.anchor}“`;
  return null;
}

export function SpotList({
  spots,
  bySlug,
  /** Fortlaufend nummerieren — bei einer Sammlung ist die Folge die Aussage. */
  numbered = false,
  /** Zusätzliches Ziel je Eintrag, etwa für die Ausschnitts-Wiedergabe. */
  hrefOf,
}: {
  spots: readonly Spot[];
  bySlug: Map<Slug, Item>;
  numbered?: boolean;
  hrefOf?: (spot: Spot, index: number) => string;
}) {
  if (spots.length === 0) return null;

  return (
    <ol className="space-y-2">
      {spots.map((spot, index) => {
        const item = bySlug.get(spot.slug);
        if (!item) return null;

        const Icon = KIND_ICON[item.kind];
        const poster = posterUrl(item);
        const where = describeTarget(spot.target);

        return (
          <li key={`${spot.slug}-${index}`}>
            <Link
              href={hrefOf?.(spot, index) ?? referenceHref(spot.slug, spot.target)}
              className="group flex gap-3 rounded-xl border border-rand bg-grund-2 p-2.5 transition-colors hover:border-akzent/50"
            >
              {numbered ? (
                <span className="mt-0.5 w-5 shrink-0 text-center text-sm text-schrift-3 tabular-nums">
                  {index + 1}
                </span>
              ) : null}

              <span className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-grund-3">
                {poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={poster}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover object-top"
                  />
                ) : null}
                {item.kind !== "text" ? (
                  <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100">
                    <Play
                      aria-hidden
                      className="size-6 fill-current text-white drop-shadow"
                    />
                  </span>
                ) : null}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <Icon aria-hidden className="size-3.5 shrink-0 text-schrift-3" />
                  <span className="text-sm leading-snug font-medium group-hover:text-akzent">
                    {item.title}
                  </span>
                  {where ? (
                    <span className="rounded bg-akzent/10 px-1.5 py-0.5 text-xs font-medium text-akzent tabular-nums">
                      {where}
                    </span>
                  ) : null}
                </span>
                {spot.note ? (
                  <span className="mt-1 line-clamp-2 block text-sm text-schrift-2">
                    {spot.note}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
