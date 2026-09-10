import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { SectionTitle } from "@/components/ui/basis";
import { formatTimecode } from "@/lib/library/chapters";
import type { Item, LinkTarget, Reference, Slug } from "@/lib/library/types";
import { referenceHref } from "@/lib/library/wikilink";
import { posterUrl } from "@/lib/library/urls";

/*
 * "Verwandte Stellen" unter einem Beitrag.
 *
 * Gezeigt werden die eigenen Bezüge UND die Rückverweise. Die Rückverweise
 * werden berechnet, nicht geschrieben: ein Bezug wird an einer Stelle notiert
 * und erscheint auf beiden Beiträgen. Sonst müsste jede Beziehung zweimal
 * gepflegt und konsistent gehalten werden.
 */

type Entry = {
  slug: Slug;
  /** Wohin der Klick führt. */
  target: LinkTarget;
  /** Die Stelle, die der Verweis nennt — bei Rückverweisen die HIESIGE. */
  mentioned: LinkTarget;
  note: string;
  /** true, wenn der Verweis vom anderen Beitrag kommt. */
  incoming: boolean;
};

function describeTarget(target: LinkTarget): string | null {
  if (target.kind === "zeit") {
    return target.end === null
      ? formatTimecode(target.start)
      : `${formatTimecode(target.start)}–${formatTimecode(target.end)}`;
  }
  if (target.kind === "abschnitt") return `Abschnitt „${target.anchor}“`;
  return null;
}

export function ReferenceList({
  references,
  backlinks,
  bySlug,
}: {
  references: Reference[];
  backlinks: Reference[];
  bySlug: Map<Slug, Item>;
}) {
  const entries: Entry[] = [
    ...references.map((reference) => ({
      slug: reference.to,
      // Eigener Bezug: der Klick führt genau an die genannte Stelle.
      target: reference.target,
      mentioned: reference.target,
      note: reference.note,
      incoming: false,
    })),
    ...backlinks.map((reference) => ({
      slug: reference.from,
      /*
       * Rückverweis: die Zeitmarke des Bezugs gehört zu DIESEM Beitrag, nicht
       * zum Quellbeitrag. Ein "?t=15" auf den Quellbeitrag wäre falsch — und
       * bei einem Textbeitrag sogar unsinnig. Der Klick führt deshalb an den
       * Anfang des Beitrags, der hierher verweist.
       */
      target: { kind: "ganz" } as LinkTarget,
      mentioned: reference.target,
      note: reference.note,
      incoming: true,
    })),
  ];

  // Ein Ziel nur einmal zeigen; der eigene Bezug hat Vorrang vor dem Rückverweis.
  const seen = new Set<string>();
  const unique = entries.filter((entry) => {
    const key = `${entry.slug}|${JSON.stringify(entry.target)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) return null;

  return (
    <section>
      <SectionTitle hint="einmal notiert, auf beiden Seiten sichtbar">
        Verwandte Stellen
      </SectionTitle>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {unique.map((entry, index) => {
          const target = bySlug.get(entry.slug);
          if (!target) return null;
          const poster = posterUrl(target);
          const where = describeTarget(entry.mentioned);

          return (
            <li key={`${entry.slug}-${index}`}>
              <Link
                href={referenceHref(entry.slug, entry.target)}
                className="group flex gap-3 rounded-xl border border-rand bg-grund-2 p-2.5 transition-colors hover:border-akzent/50"
              >
                <span className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-grund-3">
                  {poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={poster}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-1">
                    <span className="line-clamp-2 text-sm leading-snug font-medium group-hover:text-akzent">
                      {target.title}
                    </span>
                    <ArrowUpRight
                      aria-hidden
                      className="mt-0.5 size-3.5 shrink-0 text-schrift-3"
                    />
                  </span>
                  <span className="mt-0.5 block text-xs text-schrift-3">
                    {entry.incoming
                      ? where
                        ? `verweist auf ${where} hier`
                        : "verweist auf diesen Beitrag"
                      : where
                        ? `hier genannt · ab ${where}`
                        : "hier genannt"}
                  </span>
                  {entry.note ? (
                    <span className="mt-1 line-clamp-2 block text-xs text-schrift-2">
                      {entry.note}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
