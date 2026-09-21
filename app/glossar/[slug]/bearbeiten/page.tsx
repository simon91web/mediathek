import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BegriffEditor } from "@/components/glossar/begriff-editor";
import { ButtonLink, Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { getGlossaryEntry } from "@/lib/library";
import { readGlossaryMarkdown } from "@/lib/library/glossary-write";
import { isSlug } from "@/lib/library/slug";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isSlug(slug)) return { title: "Nicht gefunden" };
  const entry = await getGlossaryEntry(slug);
  return { title: entry ? `${entry.begriff} bearbeiten` : "Nicht gefunden" };
}

export default async function BegriffBearbeitenPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();

  const [entry, features] = await Promise.all([
    getGlossaryEntry(slug),
    getFeatures(),
  ]);
  if (!entry) notFound();

  if (!features.authorMode) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Leer titel="Bearbeiten ist ausgeschaltet">
          {features.readonly
            ? "Diese Mediathek ist zum Ansehen eingerichtet. Begriffe werden " +
              "dort bearbeitet, wo die Bibliothek gepflegt wird."
            : "Der Autorenmodus ist aus. Er lässt sich unter Einstellungen " +
              "einschalten."}
        </Leer>
        <div className="mt-4 flex justify-center gap-2">
          <ButtonLink href={`/glossar/${slug}`} variant="primaer">
            Zum Begriff
          </ButtonLink>
        </div>
      </div>
    );
  }

  const stored = await readGlossaryMarkdown(slug);

  return (
    <div className="mx-auto max-w-3xl">
      <BegriffEditor
        slug={entry.slug}
        initialBegriff={entry.begriff}
        initialSchreibweisen={entry.schreibweisen}
        initialDescription={entry.description}
        initialRaw={stored.content}
        initialMtimeMs={stored.mtimeMs}
      />
    </div>
  );
}
