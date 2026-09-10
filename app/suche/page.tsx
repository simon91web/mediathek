import type { Metadata } from "next";
import Link from "next/link";
import { AudioLines, FileText, Film } from "lucide-react";

import { SearchBox } from "@/components/search/search-box";
import { Leer } from "@/components/ui/basis";
import { search } from "@/lib/search";
import type { SearchHit } from "@/lib/search";
import { formatTimecode } from "@/lib/library/chapters";
import type { MediaKind } from "@/lib/library/types";
import { cn, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Suche" };

const KIND_ICON = { video: Film, audio: AudioLines, text: FileText } as const;

const HIT_LABEL: Record<SearchHit["hitKind"], string> = {
  titel: "Titel und Schlagworte",
  beschreibung: "Beschreibung",
  zusammenfassung: "Zusammenfassung",
  kapitel: "Kapitel",
  transkript: "im Gesprochenen",
  text: "im Text",
  anhang: "im Anhang",
};

function toKinds(art: string | undefined): MediaKind[] | undefined {
  if (art === "video" || art === "audio" || art === "text") return [art];
  return undefined;
}

export default async function SuchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; art?: string }>;
}) {
  const { q, art } = await searchParams;
  const query = (q ?? "").trim();

  const result = query
    ? await search(query, { kinds: toKinds(art), limit: 60 })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suche</h1>
        <p className="mt-1 text-sm text-schrift-2">
          Durchsucht Titel, Beschreibungen, Kapitel, Zusammenfassungen,
          Textbeiträge und das Gesprochene. Ein Treffer im Gesprochenen führt
          an die Stelle im Beitrag.
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
              Es wird auch in der Wortmitte gesucht, Umlaute sind gleichgültig
              ({"„aufblaehung“ findet „Aufblähung“"}). Eine
              Wortgruppe in Anführungszeichen wird wörtlich gesucht. Fehlt ein
              Transkript, lässt es sich am Beitrag erzeugen.
            </Leer>
          ) : (
            <ul className="space-y-2">
              {result.hits.map((hit, index) => (
                <li key={`${hit.slug}-${index}`}>
                  <HitRow hit={hit} />
                </li>
              ))}
            </ul>
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

function HitRow({ hit }: { hit: SearchHit }) {
  const Icon = KIND_ICON[hit.kind];

  return (
    <Link
      href={hit.href}
      className="group block rounded-xl border border-rand bg-grund-2 p-3 transition-colors hover:border-akzent/50"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Icon aria-hidden className="size-3.5 shrink-0 text-schrift-3" />
        <span className="font-medium group-hover:text-akzent">{hit.title}</span>
        {hit.start !== null ? (
          <span className="rounded bg-akzent/10 px-1.5 py-0.5 text-xs font-medium text-akzent tabular-nums">
            {formatTimecode(hit.start)}
          </span>
        ) : null}
        <span className="text-xs text-schrift-3">
          {HIT_LABEL[hit.hitKind]}
          {hit.attachment
            ? ` · ${hit.attachment.file}`
            : hit.chapterTitle
              ? ` · ${hit.chapterTitle}`
              : ""}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-schrift-2">
        <Marked snippet={hit.snippet} />
      </p>
    </Link>
  );
}

/**
 * Setzt die Markierungen aus den Offsets.
 *
 * Bewusst kein dangerouslySetInnerHTML: der Text kommt aus der Bibliothek,
 * ist also Fremdtext. Die Suche liefert deshalb Offsets, kein HTML.
 */
function Marked({ snippet }: { snippet: SearchHit["snippet"] }) {
  if (snippet.marks.length === 0) return <>{snippet.text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of snippet.marks) {
    if (start < cursor) continue;
    if (start > cursor) parts.push(snippet.text.slice(cursor, start));
    parts.push(
      <mark
        key={start}
        className={cn(
          "rounded bg-akzent/20 px-0.5 text-schrift",
          "dark:bg-akzent/30",
        )}
      >
        {snippet.text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < snippet.text.length) parts.push(snippet.text.slice(cursor));
  return <>{parts}</>;
}
