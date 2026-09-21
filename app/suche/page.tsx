import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { HitList } from "@/components/search/hit-list";
import { SaveSearch } from "@/components/search/save-search";
import { SearchBox } from "@/components/search/search-box";
import { Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { search } from "@/lib/search";
import type { Expansion } from "@/lib/search";
import type { MediaKind } from "@/lib/library/types";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Suche" };

function toKinds(art: string | undefined): MediaKind[] | undefined {
  if (art === "video" || art === "audio" || art === "text") return [art];
  return undefined;
}

/**
 * Woher die Erweiterung kommt — für "Auch gesucht nach …" unterhalb der
 * Trefferliste. Eine Anfrage kann beide Quellen zugleich treffen (ein Wort
 * aus einem Themen-Synonym, ein anderes aus einer Glossar-Schreibweise),
 * deshalb wird gezählt statt nur die erste Quelle zu nennen.
 */
function expansionSourceLabel(expansions: readonly Expansion[]): string {
  const kinds = new Set(expansions.map((expansion) => expansion.source.kind));
  if (kinds.size > 1) return "den Synonymen der Themenseiten und dem Glossar";
  return kinds.has("glossar")
    ? "den Schreibweisen des Glossars"
    : "den Synonymen der Themenseiten";
}

export default async function SuchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; art?: string }>;
}) {
  const { q, art } = await searchParams;
  const query = (q ?? "").trim();

  const [result, features] = await Promise.all([
    query ? search(query, { kinds: toKinds(art), limit: 60 }) : null,
    getFeatures(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suche</h1>
        <p className="mt-1 text-sm text-schrift-2">
          Durchsucht Titel, Beschreibungen, Kapitel, Zusammenfassungen,
          Textbeiträge und das Gesprochene. Ein Treffer im Gesprochenen führt an
          die Stelle im Beitrag.
        </p>
      </div>

      {/* key: so übernimmt das Feld den neuen Begriff, ohne Effect. */}
      <SearchBox key={query} autoFocus initialQuery={query} />

      {result ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-schrift-2">
            <p>
              {result.hits.length === 0
                ? "Nichts gefunden."
                : `${plural(result.hits.length, "Fundstelle", "Fundstellen")}` +
                  (result.total > result.hits.length
                    ? ` von ${result.total}`
                    : "")}
            </p>
            <p className="text-xs text-schrift-3">{result.tookMs} ms</p>
          </div>

          {/*
            Der Moment, in dem eine Anfrage sich als brauchbar erweist, ist
            der richtige, um sie zu behalten. Danach legt sie niemand mehr
            von Hand als Datei an.
          */}
          {features.authorMode && result.hits.length > 0 ? (
            <SaveSearch query={query} />
          ) : null}

          {/*
           * Wonach zusätzlich gesucht wurde. Das steht hier offen, weil die
           * Erweiterung nur so gut ist wie ihre Quelle — Themen-Synonyme oder
           * Glossar-Schreibweisen — und weil sie sich damit korrigieren lässt.
           */}
          {result.expansions.length > 0 ? (
            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 rounded-lg border border-rand bg-grund-2 px-3 py-2 text-sm text-schrift-2">
              <Sparkles
                aria-hidden
                className="size-3.5 shrink-0 self-center text-schrift-3"
              />
              <span>Auch gesucht nach</span>
              {result.expansions.map((expansion, index) => (
                <span key={expansion.folded}>
                  <Link
                    href={`/suche?q=${encodeURIComponent(expansion.term)}`}
                    className="text-akzent hover:underline"
                  >
                    {expansion.term}
                  </Link>
                  {index < result.expansions.length - 1 ? "," : ""}
                </span>
              ))}
              <span className="text-schrift-3">
                — aus {expansionSourceLabel(result.expansions)}.
              </span>
            </p>
          ) : null}

          {result.status.state === "baut" ? (
            <p className="rounded-lg border border-rand bg-grund-2 px-3 py-2 text-sm text-schrift-2">
              Der Suchindex wird noch aufgebaut — gleich sind es mehr Treffer.
            </p>
          ) : null}
          {result.degraded && result.status.error ? (
            <p className="rounded-lg border border-warnung/40 bg-warnung-grund px-3 py-2 text-sm text-warnung">
              {result.status.error}
            </p>
          ) : null}

          {result.hits.length === 0 ? (
            <Leer titel="Kein Treffer">
              Es wird auch in der Wortmitte gesucht, Umlaute sind gleichgültig (
              {"„aufblaehung“ findet „Aufblähung“"}). Eine Wortgruppe in
              Anführungszeichen wird wörtlich gesucht. Fehlt ein Transkript,
              lässt es sich am Beitrag erzeugen.
            </Leer>
          ) : (
            <HitList hits={result.hits} />
          )}
        </>
      ) : (
        <Leer titel="Wonach suchst du?">
          Zum Beispiel nach einem Fachbegriff, der in mehreren Beiträgen
          vorkommt. Treffer im Gesprochenen führen direkt an die Stelle.
        </Leer>
      )}
    </div>
  );
}
