import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BeitragEditor } from "@/components/editor/beitrag-editor";
import { ButtonLink, Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { getItem } from "@/lib/library";
import { isSlug } from "@/lib/library/slug";
import { mediaUrl, posterUrl } from "@/lib/library/urls";
import { readItemMarkdown } from "@/lib/library/write";
import { renderItemMarkdown } from "@/lib/library/beitrag-md";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isSlug(slug)) return { title: "Nicht gefunden" };
  const item = await getItem(slug);
  return { title: item ? `${item.title} bearbeiten` : "Nicht gefunden" };
}

export default async function BearbeitenPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();

  const [item, features] = await Promise.all([getItem(slug), getFeatures()]);
  if (!item) notFound();

  if (!features.authorMode) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Leer titel="Bearbeiten ist ausgeschaltet">
          {features.readonly
            ? "Diese Mediathek ist zum Ansehen eingerichtet. Beiträge werden " +
              "dort bearbeitet, wo die Bibliothek gepflegt wird."
            : "Der Autorenmodus ist aus. Er lässt sich unter Einstellungen " +
              "einschalten."}
        </Leer>
        <div className="mt-4 flex justify-center gap-2">
          <ButtonLink href={`/medien/${slug}`} variant="primaer">
            Zum Beitrag
          </ButtonLink>
          {features.readonly ? null : (
            <ButtonLink href="/einstellungen">Einstellungen</ButtonLink>
          )}
        </div>
      </div>
    );
  }

  const stored = await readItemMarkdown(slug);

  /*
   * Fehlt beitrag.md, wird eine Vorlage angeboten statt ein leeres Feld: so
   * finden Mensch und Claude Code dieselbe Struktur vor, und die Marker sind
   * von Anfang an da. Geschrieben wird erst beim Speichern.
   */
  const content =
    stored.content ||
    renderItemMarkdown({
      title: item.title,
      kind: item.kind,
      recorded: item.recorded,
      durationSeconds: item.durationSeconds,
      tags: item.tags,
    });

  return (
    <BeitragEditor
      slug={item.slug}
      title={item.title}
      kind={item.kind}
      initialContent={content}
      initialMtimeMs={stored.mtimeMs}
      mediaSrc={mediaUrl(item)}
      mediaMime={item.assets.mediaMime}
      poster={posterUrl(item)}
      chapters={item.chapters}
      durationSeconds={item.durationSeconds}
    />
  );
}
