import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { MarkdownText } from "@/components/markdown";
import { ItemCard } from "@/components/media/item-card";
import { SpotList } from "@/components/media/spot-list";
import { SectionTitle } from "@/components/ui/basis";
import { BefundListe } from "@/components/vollstaendigkeit/befund-liste";
import { STUFE_CLASS, STUFE_LABEL } from "@/components/vollstaendigkeit/stufe";
import { getTopic, getLibrary } from "@/lib/library";
import { isSlug } from "@/lib/library/slug";
import { plural } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isSlug(slug)) return { title: "Nicht gefunden" };
  const topic = await getTopic(slug);
  return { title: topic?.title ?? "Nicht gefunden" };
}

export default async function ThemaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();

  const [topic, library] = await Promise.all([getTopic(slug), getLibrary()]);
  if (!topic) notFound();

  const vollstaendigkeit = library.completeness.byTopic.get(topic.slug);

  // Die Reihenfolge der Datei gewinnt — sie ist die Reihenfolge im Thema.
  const items = topic.itemSlugs
    .map((entry) => library.bySlug.get(entry))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-wide text-schrift-3 uppercase">Thema</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {topic.title}
        </h1>
        {vollstaendigkeit ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${STUFE_CLASS[vollstaendigkeit.fachfremd.stufe]}`}
            >
              Fachfremd: {STUFE_LABEL[vollstaendigkeit.fachfremd.stufe]}
            </span>
            <span
              className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${STUFE_CLASS[vollstaendigkeit.fachkundig.stufe]}`}
            >
              Fachkundig: {STUFE_LABEL[vollstaendigkeit.fachkundig.stufe]}
            </span>
          </div>
        ) : null}
        <p className="mt-1 text-sm text-schrift-2">
          {/* "0 Teile" wäre bei einer reinen Fundstellenseite nur Lärm. */}
          {[
            items.length > 0 ? plural(items.length, "Teil", "Teile") : null,
            topic.spots.length > 0
              ? plural(topic.spots.length, "Fundstelle", "Fundstellen")
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "noch nichts zugeordnet"}
        </p>
        {topic.synonyms.length > 0 ? (
          <p className="mt-2 flex flex-wrap items-baseline gap-1.5 text-xs">
            <span className="text-schrift-3">Auch genannt:</span>
            {topic.synonyms.map((synonym) => (
              <span
                key={synonym}
                className="rounded-md bg-grund-3 px-2 py-0.5 text-schrift-2"
              >
                {synonym}
              </span>
            ))}
          </p>
        ) : null}
        {topic.description ? (
          <div className="prosa mt-3 max-w-prose text-[15px]">
            <MarkdownText>{topic.description}</MarkdownText>
          </div>
        ) : null}
      </div>

      {topic.missingSlugs.length > 0 ? (
        <p className="flex items-start gap-2 rounded-xl border border-warnung/40 bg-warnung-grund px-4 py-3 text-sm text-warnung">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {topic.missingSlugs.length === 1
              ? "Dieses Thema nennt einen Beitrag, den es nicht gibt: "
              : `Dieses Thema nennt ${topic.missingSlugs.length} Beiträge, die es nicht gibt: `}
            <span className="font-mono text-xs">
              {topic.missingSlugs.join(", ")}
            </span>
            . Vermutlich wurde ein Ordner umbenannt.
          </span>
        </p>
      ) : null}

      {items.length > 0 ? (
        <section>
          <SectionTitle hint="in dieser Reihenfolge">Beiträge</SectionTitle>
          <ol className="space-y-4">
            {items.map((item, index) => (
              <li key={item.slug} className="flex gap-4">
                <span
                  aria-hidden
                  className="mt-1 grid size-7 shrink-0 place-items-center rounded-full border border-rand bg-grund-2 text-xs font-medium tabular-nums text-schrift-2"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 sm:max-w-sm">
                  <ItemCard item={item} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {topic.spots.length > 0 ? (
        <section>
          <SectionTitle hint="einzelne Stellen quer durch die Bibliothek">
            Fundstellen
          </SectionTitle>
          <SpotList spots={topic.spots} bySlug={library.bySlug} />
        </section>
      ) : null}

      {vollstaendigkeit ? (
        <section className="space-y-4">
          <div>
            <SectionTitle hint="Breite für Einsteiger, live berechnet">
              Sicht: Fachfremd
            </SectionTitle>
            <BefundListe
              befunde={vollstaendigkeit.fachfremd.befunde}
              bySlug={library.bySlug}
            />
          </div>
          <div>
            <SectionTitle
              hint={
                vollstaendigkeit.fachkundig.stufe === "ungeprueft"
                  ? "noch nicht geprüft"
                  : "Tiefe und Präzision für Experten"
              }
            >
              Sicht: Fachkundig
            </SectionTitle>
            {vollstaendigkeit.fachkundig.stufe === "ungeprueft" ? (
              <p className="text-sm text-schrift-2">
                Noch nicht geprüft. Der Knopf „Lücken analysieren“ auf{" "}
                <Link href="/themen" className="text-akzent hover:underline">
                  /themen
                </Link>{" "}
                trägt das hier nach.
              </p>
            ) : (
              <BefundListe
                befunde={vollstaendigkeit.fachkundig.befunde}
                bySlug={library.bySlug}
              />
            )}
          </div>
        </section>
      ) : null}

      <p className="text-sm">
        <Link href="/themen" className="text-akzent hover:underline">
          ← Alle Themen
        </Link>
      </p>
    </div>
  );
}
