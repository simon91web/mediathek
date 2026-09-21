import Link from "next/link";
import { ExternalLink, Play } from "lucide-react";

import { formatTimecode } from "@/lib/library/chapters";
import { referenceLabel, splitAnswer } from "@/lib/library/answer-text";
import { referenceHref } from "@/lib/library/wikilink";
import type { Slug } from "@/lib/library/types";

/*
 * Eine Glossar-Definition mit anklickbaren Verweisen — dasselbe Format wie
 * eine Fragen-Antwort (lib/library/answer-text.ts), nur mit einer
 * zusätzlichen Auflösung: [[slug]] zeigt zuerst auf einen ANDEREN Begriff,
 * erst wenn keiner mit dieser Kennung existiert auf einen Beitrag. So bleibt
 * die Klammer-Schreibweise überall in der Bibliothek dieselbe, und trotzdem
 * kann eine Definition auf einen anderen Begriff verweisen — den eigentlichen
 * Wiki-Charakter, den eine reine Fundstellenliste nicht hätte.
 */

export function DefinitionText({
  text,
  itemTitles,
  glossaryTitles,
}: {
  text: string;
  /** Beitrags-Kennung → Titel. */
  itemTitles: Readonly<Record<string, string>>;
  /** Begriffs-Kennung → kanonischer Begriff. */
  glossaryTitles: Readonly<Record<string, string>>;
}) {
  if (!text.trim()) return null;
  const absaetze = text.split(/\n{2,}/);

  return (
    <div className="prosa max-w-prose text-[15px]">
      {absaetze.map((absatz, index) => (
        <p
          key={index}
          className="mt-3 leading-relaxed whitespace-pre-wrap first:mt-0"
        >
          {splitAnswer(absatz).map((stueck, position) => {
            if (stueck.kind === "text") {
              return <span key={position}>{stueck.text}</span>;
            }

            if (stueck.kind === "web") {
              return (
                <a
                  key={position}
                  href={stueck.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-baseline gap-1 text-akzent underline decoration-akzent/40 underline-offset-2 hover:decoration-akzent"
                >
                  {stueck.url}
                  <ExternalLink aria-hidden className="size-3 self-center" />
                </a>
              );
            }

            // Erst als Begriff versuchen, dann als Beitrag — dieselbe
            // Klammer, zwei mögliche Ziele.
            const begriff = glossaryTitles[stueck.slug];
            if (begriff && stueck.target.kind === "ganz") {
              return (
                <Link
                  key={position}
                  href={`/glossar/${stueck.slug}`}
                  className="rounded bg-grund-3 px-1.5 py-0.5 text-sm font-medium text-schrift hover:bg-grund-3/70 hover:text-akzent"
                >
                  {begriff}
                </Link>
              );
            }

            const titel = itemTitles[stueck.slug];
            const beschriftung = referenceLabel(
              stueck.slug as Slug,
              stueck.target,
              titel,
              formatTimecode,
            );

            if (!titel) {
              return (
                <span
                  key={position}
                  title="Diesen Begriff oder Beitrag gibt es in dieser Bibliothek nicht."
                  className="rounded bg-grund-3 px-1 text-xs text-schrift-3"
                >
                  {beschriftung}
                </span>
              );
            }

            return (
              <Link
                key={position}
                href={referenceHref(stueck.slug as Slug, stueck.target)}
                className="inline-flex items-baseline gap-1 rounded bg-akzent/10 px-1.5 py-0.5 text-xs font-medium text-akzent hover:bg-akzent/20"
              >
                <Play aria-hidden className="size-3 self-center" />
                {beschriftung}
              </Link>
            );
          })}
        </p>
      ))}
    </div>
  );
}
