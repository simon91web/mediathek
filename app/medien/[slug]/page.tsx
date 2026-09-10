import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";

import { MarkdownText, MarkdownWithAnchors } from "@/components/markdown";
import { AttachmentList } from "@/components/media/attachment-list";
import { Description } from "@/components/media/description";
import { ProblemBanner } from "@/components/media/problem-banner";
import { ReferenceList } from "@/components/media/reference-list";
import { SidePanel } from "@/components/media/side-panel";
import { MediaView } from "@/components/player/media-view";
import { PlayerProvider } from "@/components/player/player-provider";
import { ButtonLink } from "@/components/ui/basis";
import {
  getBacklinks,
  getCoursesForItem,
  getItem,
  getLibrary,
} from "@/lib/library";
import { isSlug } from "@/lib/library/slug";
import { mediaUrl, posterUrl } from "@/lib/library/urls";
import { formatDurationShort, formatRecorded, plural } from "@/lib/utils";

const KIND_LABEL = {
  video: "Video",
  audio: "Sprachmemo",
  text: "Text",
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isSlug(slug)) return { title: "Nicht gefunden" };
  const item = await getItem(slug);
  return { title: item?.title ?? "Nicht gefunden" };
}

export default async function BeitragPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();

  const [item, backlinks, courses, library, search] = await Promise.all([
    getItem(slug),
    getBacklinks(slug),
    getCoursesForItem(slug),
    getLibrary(),
    searchParams,
  ]);

  if (!item) notFound();

  /*
   * Sprungziel aus der Adresse. Geprüft wird serverseitig; gesetzt wird es im
   * Player erst, wenn die Metadaten da sind — vorher verwirft der Browser
   * currentTime still.
   */
  const requested = Number(search.t);
  const startAt =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, (item.durationSeconds ?? requested) + 60)
      : null;

  const src = mediaUrl(item);
  const recorded = formatRecorded(item.recorded);
  const duration = formatDurationShort(item.durationSeconds);

  const attachments = (
    <AttachmentList slug={item.slug} attachments={item.attachments} />
  );
  const summary = item.summary ? (
    <div className="prosa p-4 text-sm">
      <MarkdownText>{item.summary}</MarkdownText>
    </div>
  ) : null;

  return (
    <PlayerProvider>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            {item.kind !== "text" && src ? (
              <MediaView
                slug={item.slug}
                title={item.title}
                kind={item.kind}
                src={src}
                mimeType={item.assets.mediaMime}
                poster={posterUrl(item)}
                chapters={item.chapters}
                durationSeconds={item.durationSeconds}
                startAt={startAt}
              />
            ) : null}

            {item.kind !== "text" && !src ? (
              <p className="rounded-xl border border-warnung/40 bg-warnung-grund p-4 text-sm text-warnung">
                Zu diesem Beitrag gibt es keine abspielbare Datei.
              </p>
            ) : null}

            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {item.title}
              </h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-schrift-2">
                <span>{KIND_LABEL[item.kind]}</span>
                {recorded ? <span>· {recorded}</span> : null}
                {duration ? <span>· {duration}</span> : null}
                {item.chapters.length > 0 ? (
                  <span>
                    ·{" "}
                    {item.kind === "text"
                      ? plural(item.chapters.length, "Abschnitt", "Abschnitte")
                      : `${item.chapters.length} Kapitel`}
                  </span>
                ) : null}
              </p>

              {item.tags.length > 0 ? (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/medien?schlagwort=${encodeURIComponent(tag)}`}
                      className="rounded-md bg-grund-3 px-2 py-0.5 text-xs text-schrift-2 hover:bg-akzent/10 hover:text-akzent"
                    >
                      {tag}
                    </Link>
                  ))}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <ButtonLink
                  href={`/medien/${item.slug}/bearbeiten`}
                  size="klein"
                >
                  <Pencil aria-hidden className="size-3.5" />
                  Bearbeiten
                </ButtonLink>
              </div>
            </div>

            <ProblemBanner problems={item.problems} />

            {item.description ? (
              item.kind === "text" ? (
                /*
                 * Bei Textbeiträgen ist der Body der Inhalt. Die Überschriften
                 * bekommen Anker, damit das Inhaltsverzeichnis und
                 * Suchtreffer dorthin springen können.
                 */
                <article className="prosa max-w-prose">
                  <MarkdownWithAnchors chapters={item.chapters}>
                    {item.description}
                  </MarkdownWithAnchors>
                </article>
              ) : (
                <Description>
                  <MarkdownText>{item.description}</MarkdownText>
                </Description>
              )
            ) : null}

            {courses.length > 0 ? (
              <CourseNavigation
                courses={courses}
                slug={item.slug}
                titles={library.bySlug}
              />
            ) : null}
          </div>

          <SidePanel
            slug={item.slug}
            chapters={item.chapters}
            hasTranscript={item.hasTranscript}
            attachmentCount={item.attachments.length}
            attachments={attachments}
            summary={summary}
            chaptersLabel={item.kind === "text" ? "Inhalt" : "Kapitel"}
          />
        </div>

        <ReferenceList
          references={item.references}
          backlinks={backlinks}
          bySlug={library.bySlug}
        />
      </div>
    </PlayerProvider>
  );
}

/** "Teil 3 von 7" mit Vor und Zurück, je Kurs. */
function CourseNavigation({
  courses,
  slug,
  titles,
}: {
  courses: Awaited<ReturnType<typeof getCoursesForItem>>;
  slug: string;
  titles: Awaited<ReturnType<typeof getLibrary>>["bySlug"];
}) {
  return (
    <div className="space-y-2">
      {courses.map((course) => {
        const existing = course.itemSlugs.filter((entry) => titles.has(entry));
        const index = existing.indexOf(slug);
        const previous = index > 0 ? existing[index - 1] : null;
        const next =
          index >= 0 && index < existing.length - 1 ? existing[index + 1] : null;

        return (
          <div
            key={course.slug}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rand bg-grund-2 px-3 py-2"
          >
            <p className="text-sm">
              <Link
                href={`/kurse/${course.slug}`}
                className="font-medium hover:text-akzent"
              >
                {course.title}
              </Link>
              {index >= 0 ? (
                <span className="text-schrift-2">
                  {" "}
                  · Teil {index + 1} von {existing.length}
                </span>
              ) : null}
            </p>
            <div className="flex gap-1.5">
              {previous ? (
                <ButtonLink href={`/medien/${previous}`} size="klein">
                  <ChevronLeft aria-hidden className="size-3.5" />
                  {titles.get(previous)?.title ?? "Zurück"}
                </ButtonLink>
              ) : null}
              {next ? (
                <ButtonLink href={`/medien/${next}`} size="klein">
                  {titles.get(next)?.title ?? "Weiter"}
                  <ChevronRight aria-hidden className="size-3.5" />
                </ButtonLink>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
