import Link from "next/link";
import { AudioLines, FileText, Film, Sparkles } from "lucide-react";

import { formatTimecode } from "@/lib/library/chapters";
import type { SearchHit } from "@/lib/search";
import { cn } from "@/lib/utils";

/*
 * Die Trefferliste. Wird von der Suchseite und von einer gespeicherten
 * Sammlung benutzt — dieselben Treffer, einmal gefragt und einmal gemerkt.
 */

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

export function HitList({ hits }: { hits: readonly SearchHit[] }) {
  return (
    <ul className="space-y-2">
      {hits.map((hit, index) => (
        <li key={`${hit.slug}-${index}`}>
          <HitRow hit={hit} />
        </li>
      ))}
    </ul>
  );
}

export function HitRow({ hit }: { hit: SearchHit }) {
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

      {/*
       * Ein über ein Synonym gefundener Treffer wird als solcher
       * gekennzeichnet. Eine stille Erweiterung wäre schlimmer als keine —
       * man hielte den Fremdtreffer für einen eigenen und wüsste nicht,
       * warum das Wort im Auszug fehlt.
       */}
      {hit.via ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-schrift-3">
          <Sparkles aria-hidden className="size-3 shrink-0" />
          gefunden über „{hit.via.term}“ aus dem Thema {hit.via.topic.title}
        </p>
      ) : null}
    </Link>
  );
}

/**
 * Setzt die Markierungen aus den Offsets.
 *
 * Bewusst kein dangerouslySetInnerHTML: der Text kommt aus der Bibliothek,
 * ist also Fremdtext. Die Suche liefert deshalb Offsets, kein HTML.
 */
export function Marked({ snippet }: { snippet: SearchHit["snippet"] }) {
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
