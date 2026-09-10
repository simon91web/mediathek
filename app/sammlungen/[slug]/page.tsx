import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Play, Search } from "lucide-react";

import { MarkdownText } from "@/components/markdown";
import { SpotList } from "@/components/media/spot-list";
import { HitList } from "@/components/search/hit-list";
import { ButtonLink, Leer, SectionTitle } from "@/components/ui/basis";
import { getCollection, getLibrary } from "@/lib/library";
import { isSlug } from "@/lib/library/slug";
import { collectionPlayHref } from "@/lib/library/urls";
import { search } from "@/lib/search";
import { plural } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isSlug(slug)) return { title: "Nicht gefunden" };
  const collection = await getCollection(slug);
  return { title: collection?.title ?? "Nicht gefunden" };
}

export default async function SammlungPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();

  const [collection, library] = await Promise.all([
    getCollection(slug),
    getLibrary(),
  ]);
  if (!collection) notFound();

  /*
   * Die gespeicherte Suche läuft bei jedem Aufruf neu. Genau darin liegt ihr
   * Sinn: kommt ein Beitrag dazu, steht er von selbst mit drin.
   */
  const found = collection.query
    ? await search(collection.query, { limit: 40 })
    : null;

  const playable = collection.entries.filter((entry) =>
    library.bySlug.has(entry.slug),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-wide text-schrift-3 uppercase">
          {collection.query ? "Gespeicherte Suche" : "Sammlung"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {collection.title}
        </h1>
        <p className="mt-1 text-sm text-schrift-2">
          {collection.query
            ? `Sucht nach „${collection.query}“`
            : plural(playable.length, "Ausschnitt", "Ausschnitte")}
        </p>
        {collection.description ? (
          <div className="prosa mt-3 max-w-prose text-[15px]">
            <MarkdownText>{collection.description}</MarkdownText>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {playable.length > 0 ? (
            <ButtonLink
              href={collectionPlayHref(collection.slug, 0, playable[0])}
              size="klein"
              variant="primaer"
            >
              <Play aria-hidden className="size-3.5" />
              Von vorn abspielen
            </ButtonLink>
          ) : null}
          {collection.query ? (
            <ButtonLink
              href={`/suche?q=${encodeURIComponent(collection.query)}`}
              size="klein"
            >
              <Search aria-hidden className="size-3.5" />
              In der Suche öffnen
            </ButtonLink>
          ) : null}
        </div>
      </div>

      {collection.missingSlugs.length > 0 ? (
        <p className="flex items-start gap-2 rounded-xl border border-warnung/40 bg-warnung-grund px-4 py-3 text-sm text-warnung">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {collection.missingSlugs.length === 1
              ? "Ein Ausschnitt zeigt auf einen Beitrag, den es nicht gibt: "
              : `${collection.missingSlugs.length} Ausschnitte zeigen auf Beiträge, die es nicht gibt: `}
            <span className="font-mono text-xs">
              {collection.missingSlugs.join(", ")}
            </span>
            . Vermutlich wurde ein Ordner umbenannt.
          </span>
        </p>
      ) : null}

      {playable.length > 0 ? (
        <section>
          <SectionTitle hint="in dieser Reihenfolge abspielbar">
            Ausschnitte
          </SectionTitle>
          <SpotList
            spots={playable}
            bySlug={library.bySlug}
            numbered
            hrefOf={(spot, index) =>
              collectionPlayHref(collection.slug, index, spot)
            }
          />
        </section>
      ) : null}

      {found ? (
        <section>
          <SectionTitle
            hint={`${found.hits.length === 0 ? "kein Treffer" : plural(found.hits.length, "Treffer", "Treffer")} · läuft bei jedem Aufruf neu`}
          >
            Was gerade dazu da ist
          </SectionTitle>
          {found.hits.length === 0 ? (
            <Leer titel="Nichts gefunden">
              Die gespeicherte Suche{" "}
              <code className="rounded bg-grund-3 px-1">
                {collection.query}
              </code>{" "}
              liefert derzeit keine Treffer. Fehlen Transkripte, lassen sie
              sich an den Beiträgen erzeugen.
            </Leer>
          ) : (
            <HitList hits={found.hits} />
          )}
        </section>
      ) : null}

      <p className="text-sm">
        <Link href="/sammlungen" className="text-akzent hover:underline">
          ← Alle Sammlungen
        </Link>
      </p>
    </div>
  );
}
