import Link from "next/link";
import { AlertTriangle, Play } from "lucide-react";

import { referenceLabel } from "@/lib/library/answer-text";
import { formatTimecode } from "@/lib/library/chapters";
import type { Befund, BefundKategorie, Item, LinkTarget, Slug } from "@/lib/library/types";
import { referenceHref } from "@/lib/library/wikilink";
import { cn } from "@/lib/utils";

/*
 * Eine Befundliste — Fachfremd und Fachkundig sehen hier gleich aus, nur die
 * Kategorien unterscheiden sich (siehe lib/library/completeness.ts). Die drei
 * ohne KI-Beteiligung (Beschreibung, Synonym, Umfang) tragen nie einen Beleg
 * und stehen deshalb schlicht; die vier belegpflichtigen aus dem Bericht
 * bekommen dieselbe Warn-Box wie ein Beitrags-Hinweis, weil sie genau das
 * sind: ein Hinweis, kein Fehler der Mediathek.
 */

const KATEGORIE_LABEL: Record<BefundKategorie, string> = {
  "keine-beschreibung": "Keine Beschreibung",
  "synonym-ohne-fundstelle": "Synonym ohne Fundstelle",
  "wenige-fundstellen": "Wenig Umfang",
  widerspruch: "Widerspruch",
  "unbelegte-zahl": "Unbelegte Zahl",
  "nur-normalfall": "Nur Normalfall behandelt",
  "offener-verweis": "Offener Verweis",
};

const DETERMINISTISCH = new Set<BefundKategorie>([
  "keine-beschreibung",
  "synonym-ohne-fundstelle",
  "wenige-fundstellen",
]);

export function BelegPill({
  slug,
  target,
  bySlug,
}: {
  slug: Slug;
  target: LinkTarget;
  bySlug: ReadonlyMap<Slug, Item>;
}) {
  const item = bySlug.get(slug);
  const beschriftung = referenceLabel(slug, target, item?.title, formatTimecode);

  if (!item) {
    return (
      <span
        title="Diesen Beitrag gibt es in dieser Bibliothek nicht."
        className="rounded bg-grund-3 px-1 text-xs text-schrift-3"
      >
        {beschriftung}
      </span>
    );
  }

  return (
    <Link
      href={referenceHref(slug, target)}
      className="inline-flex items-baseline gap-1 rounded bg-akzent/10 px-1.5 py-0.5 text-xs font-medium text-akzent hover:bg-akzent/20"
    >
      <Play aria-hidden className="size-3 self-center" />
      {beschriftung}
    </Link>
  );
}

export function BefundListe({
  befunde,
  bySlug,
}: {
  befunde: readonly Befund[];
  bySlug: ReadonlyMap<Slug, Item>;
}) {
  if (befunde.length === 0) {
    return <p className="text-sm text-schrift-2">Keine Befunde.</p>;
  }

  return (
    <ul className="space-y-2">
      {befunde.map((befund, index) => {
        const deterministisch = DETERMINISTISCH.has(befund.kategorie);
        return (
          <li
            key={index}
            className={cn(
              "rounded-xl border px-4 py-3 text-sm",
              deterministisch
                ? "border-rand bg-grund-2 text-schrift"
                : "border-warnung/40 bg-warnung-grund text-warnung",
            )}
          >
            <div className="flex items-start gap-2">
              {deterministisch ? null : (
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              )}
              <span>
                <strong>{KATEGORIE_LABEL[befund.kategorie]}</strong> —{" "}
                {befund.text}
              </span>
            </div>
            {befund.belege.length > 0 ? (
              <div className="mt-2 ml-6 flex flex-wrap gap-1.5">
                {befund.belege.map((beleg, i) => (
                  <BelegPill
                    key={i}
                    slug={beleg.slug}
                    target={beleg.target}
                    bySlug={bySlug}
                  />
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
