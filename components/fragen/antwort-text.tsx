import Link from "next/link";
import { ExternalLink, Play } from "lucide-react";

import { formatTimecode } from "@/lib/library/chapters";
import { referenceLabel, splitAnswer } from "@/lib/library/answer-text";
import { referenceHref } from "@/lib/library/wikilink";

/*
 * Eine Antwort mit anklickbaren Belegen.
 *
 * Ein Beleg ist hier kein Fußnotenzeichen, sondern der Weg zur Stelle: ein
 * Klick öffnet den Beitrag an genau der Sekunde, aus der die Aussage stammt.
 * Damit ist die Antwort überprüfbar, und das ist der einzige Grund, warum
 * man einem Sprachmodell über das eigene Material überhaupt zuhören sollte.
 *
 * Gerendert wird aus STÜCKEN, nicht aus HTML (lib/library/answer-text.ts):
 * der Text kommt von einem Sprachmodell und ist Fremdtext.
 *
 * Kein "use client": die Komponente hat keinen Zustand. So läuft sie auf der
 * Fragenseite auf dem Server und im Chat als Teil des Clients.
 */

export function AntwortText({
  text,
  titles,
  className,
}: {
  text: string;
  /** Kennung → Titel, für lesbare Beschriftungen. Fehlt einer, bleibt die Kennung. */
  titles?: Readonly<Record<string, string>>;
  className?: string;
}) {
  // Absätze bleiben Absätze; innerhalb eines Absatzes bleiben Umbrüche stehen.
  const absaetze = text.split(/\n{2,}/);

  return (
    <div className={className}>
      {absaetze.map((absatz, index) => (
        <p
          key={index}
          className="mt-3 text-sm leading-relaxed whitespace-pre-wrap first:mt-0"
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
                  {kurzeAdresse(stueck.url)}
                  <ExternalLink aria-hidden className="size-3 self-center" />
                </a>
              );
            }

            const titel = titles?.[stueck.slug];
            const beschriftung = referenceLabel(
              stueck.slug,
              stueck.target,
              titel,
              formatTimecode,
            );

            /*
             * Ein Beleg auf einen Beitrag, den es nicht gibt, wird NICHT
             * verlinkt. Ein toter Link sähe aus wie ein Fehler der Mediathek;
             * so sieht man, dass die Antwort sich auf etwas beruft, das nicht
             * (mehr) da ist.
             */
            if (titles && !titel) {
              return (
                <span
                  key={position}
                  title="Diesen Beitrag gibt es in dieser Bibliothek nicht."
                  className="rounded bg-grund-3 px-1 text-xs text-schrift-3"
                >
                  {beschriftung}
                </span>
              );
            }

            return (
              <Link
                key={position}
                href={referenceHref(stueck.slug, stueck.target)}
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

/** Eine Adresse so kurz, dass sie eine Zeile nicht sprengt. */
function kurzeAdresse(url: string): string {
  try {
    const parsed = new URL(url);
    const rest = parsed.pathname === "/" ? "" : parsed.pathname;
    const text = `${parsed.host}${rest}`;
    return text.length > 48 ? `${text.slice(0, 47)}…` : text;
  } catch {
    return url;
  }
}
