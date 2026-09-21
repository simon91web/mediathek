import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Pencil } from "lucide-react";

import { DefinitionText } from "@/components/glossar/definition-text";
import { SpotList } from "@/components/media/spot-list";
import { ButtonLink } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { getGlossaryEntry, getLibrary } from "@/lib/library";
import { isSlug } from "@/lib/library/slug";
import { plural } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isSlug(slug)) return { title: "Nicht gefunden" };
  const entry = await getGlossaryEntry(slug);
  return { title: entry?.begriff ?? "Nicht gefunden" };
}

export default async function BegriffPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();

  const [entry, library, features] = await Promise.all([
    getGlossaryEntry(slug),
    getLibrary(),
    getFeatures(),
  ]);
  if (!entry) notFound();

  const itemTitles = Object.fromEntries(
    library.items.map((item) => [item.slug, item.title]),
  );
  const glossaryTitles = Object.fromEntries(
    library.glossary.map((other) => [other.slug, other.begriff]),
  );
  const beitraege = new Set(entry.spots.map((spot) => spot.slug)).size;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/glossar"
        className="inline-flex items-center gap-1.5 text-sm text-schrift-2 hover:text-schrift"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Glossar
      </Link>

      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-wide text-schrift-3 uppercase">
              Glossar
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {entry.begriff}
            </h1>
          </div>
          {features.authorMode ? (
            <ButtonLink href={`/glossar/${entry.slug}/bearbeiten`} size="klein">
              <Pencil aria-hidden className="size-3.5" />
              Bearbeiten
            </ButtonLink>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-schrift-2">
          {entry.spots.length > 0
            ? `${plural(entry.spots.length, "Fundstelle", "Fundstellen")} in ${plural(beitraege, "Beitrag", "Beiträgen")}`
            : "Noch keine Fundstellen"}
        </p>
        {entry.schreibweisen.length > 0 ? (
          <p className="mt-2 flex flex-wrap items-baseline gap-1.5 text-xs">
            <span className="text-schrift-3">Auch geschrieben:</span>
            {entry.schreibweisen.map((form) => (
              <span
                key={form}
                className="rounded-md bg-grund-3 px-2 py-0.5 text-schrift-2"
              >
                {form}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <DefinitionText
        text={entry.description}
        itemTitles={itemTitles}
        glossaryTitles={glossaryTitles}
      />

      {entry.problems.length > 0 ? (
        <ul className="space-y-1.5">
          {entry.problems.map((problem, index) => (
            <li
              key={index}
              className="flex items-start gap-2 rounded-xl border border-warnung/40 bg-warnung-grund px-4 py-3 text-sm text-warnung"
            >
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{problem.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {entry.spots.length > 0 ? (
        <SpotList spots={entry.spots} bySlug={library.bySlug} />
      ) : null}
    </div>
  );
}
