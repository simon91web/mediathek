import { AudioLines, FileText, Film, Paperclip } from "lucide-react";
import Link from "next/link";

import { WatchProgressBar } from "@/components/media/watch-progress-bar";
import { posterUrl } from "@/lib/library/urls";
import type { Item } from "@/lib/library/types";
import { cn, formatDurationShort, formatRecorded, plural } from "@/lib/utils";

const KIND_ICON = {
  video: Film,
  audio: AudioLines,
  text: FileText,
} as const;

const KIND_LABEL = {
  video: "Video",
  audio: "Sprachmemo",
  text: "Text",
} as const;

/**
 * Eine Kachel der Mediathek. Enthält bewusst keine server-only-Importe, damit
 * die Reihe "Weiterschauen" sie auch als Client-Insel verwenden kann.
 *
 * `resumeAt` lässt die Kachel an der gemerkten Stelle weiterlaufen.
 */
export function ItemCard({
  item,
  resumeAt,
}: {
  item: Item;
  resumeAt?: number | null;
}) {
  const poster = posterUrl(item);
  const duration = formatDurationShort(item.durationSeconds);
  const recorded = formatRecorded(item.recorded);
  const Icon = KIND_ICON[item.kind];
  // Nur echte Hinweise zeigen; ein fehlendes Transkript ist keiner.
  const hasProblems = item.problems.length > 0;

  const href =
    resumeAt && resumeAt > 0 && item.kind !== "text"
      ? `/medien/${item.slug}?t=${Math.round(resumeAt)}`
      : `/medien/${item.slug}`;

  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl outline-offset-4"
    >
      <div className="relative aspect-video overflow-hidden rounded-xl border border-rand bg-grund-3">
        {poster ? (
          // Kein next/image: die Bilder kommen aus der Bibliothek über eine
          // eigene Route, und der Optimizer würde sie nur durchkopieren.
          //
          // object-top statt der Mitte: bei einem hochformatigen Kachelbild
          // (Hochkant-Video) schneidet die 16:9-Kachel sonst die vertikale
          // Mitte heraus — bei App-Aufnahmen mit Kopfzeile oben und leerem
          // Rest darunter landet das fast immer im Leeren.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            loading="lazy"
            className="size-full object-cover object-top transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <PlaceholderArt item={item} />
        )}

        {duration ? (
          <span className="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
            {duration}
          </span>
        ) : null}

        <span
          className="absolute top-1.5 left-1.5 grid size-6 place-items-center rounded bg-black/60 text-white"
          title={KIND_LABEL[item.kind]}
        >
          <Icon aria-hidden className="size-3.5" />
          <span className="sr-only">{KIND_LABEL[item.kind]}</span>
        </span>

        <WatchProgressBar
          slug={item.slug}
          durationSeconds={item.durationSeconds}
        />
      </div>

      <div className="min-w-0">
        <h3 className="line-clamp-2 leading-snug font-medium group-hover:text-akzent">
          {item.title}
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-schrift-2">
          <span>{KIND_LABEL[item.kind]}</span>
          {recorded ? <span>· {recorded}</span> : null}
          {item.chapters.length > 0 ? (
            <span>
              ·{" "}
              {item.kind === "text"
                ? plural(item.chapters.length, "Abschnitt", "Abschnitte")
                : `${item.chapters.length} Kapitel`}
            </span>
          ) : null}
          {item.attachments.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              ·
              <Paperclip aria-hidden className="size-3" />
              {item.attachments.length}
            </span>
          ) : null}
          {hasProblems ? (
            <span className="text-warnung" title="Es gibt Hinweise zu diesem Beitrag">
              · Hinweis
            </span>
          ) : null}
        </p>
        {item.tags.length > 0 ? (
          <p className="mt-1.5 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded bg-grund-3 px-1.5 py-0.5 text-[11px] text-schrift-2"
              >
                {tag}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * Ohne Kachelbild: bei Text die ersten Zeilen (das ist aussagekräftiger als
 * jedes Symbol), sonst das Artsymbol auf ruhigem Grund.
 */
function PlaceholderArt({ item }: { item: Item }) {
  const Icon = KIND_ICON[item.kind];

  if (item.kind === "text") {
    const excerpt = item.description
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/[*_`>[\]()#]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);
    return (
      <div className="size-full overflow-hidden bg-linear-to-br from-grund-2 to-grund-3 p-3">
        <p className="line-clamp-5 text-[11px] leading-relaxed text-schrift-2">
          {excerpt || item.title}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid size-full place-items-center",
        item.kind === "audio"
          ? "bg-linear-to-br from-akzent/15 to-akzent/5"
          : "bg-grund-3",
      )}
    >
      <Icon aria-hidden className="size-8 text-schrift-3" />
    </div>
  );
}
