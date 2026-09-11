import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CornerDownRight,
  Globe,
  MessageSquare,
  Play,
} from "lucide-react";

import { AntwortText } from "@/components/fragen/antwort-text";
import { DeleteQuestionButton } from "@/components/fragen/delete-question-button";
import { ProblemBanner } from "@/components/media/problem-banner";
import { ButtonLink, Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { readSettings } from "@/lib/settings";
import { getLibrary, getQuestion } from "@/lib/library";
import { formatTimecode } from "@/lib/library/chapters";
import { referenceLabel } from "@/lib/library/answer-text";
import { referenceHref } from "@/lib/library/wikilink";

/*
 * Eine Frage mit ihrer Antwort.
 *
 * Die Belege stehen zweimal: im Text (dort, wo die Aussage steht) und
 * gesammelt darunter. Das ist keine Doppelung ohne Grund — im Text beantwortet
 * ein Klick „woher weißt du das?", darunter beantwortet die Liste „was muss
 * ich ansehen, um das wirklich zu verstehen?".
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const frage = await getQuestion(slug);
  return { title: frage ? frage.question : "Frage" };
}

export default async function FragePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [frage, library, features, settings] = await Promise.all([
    getQuestion(slug),
    getLibrary(),
    getFeatures(),
    readSettings(),
  ]);

  if (!frage) notFound();

  const titles = Object.fromEntries(
    library.items.map((item) => [item.slug, item.title]),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/fragen"
        className="inline-flex items-center gap-1.5 text-sm text-schrift-2 hover:text-schrift"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Alle Fragen
      </Link>

      <div>
        <h1 className="flex items-start gap-2 text-2xl font-semibold tracking-tight">
          <MessageSquare
            aria-hidden
            className="mt-1.5 size-5 shrink-0 text-schrift-3"
          />
          {frage.question}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-schrift-3">
          {frage.askedAt ? <span>gefragt am {frage.askedAt}</span> : null}
          {frage.usedWeb ? (
            <span className="inline-flex items-center gap-1">
              <Globe aria-hidden className="size-3" />
              auch im Internet gesucht
            </span>
          ) : null}
          <code className="rounded bg-grund-3 px-1">
            fragen/{frage.slug}.md
          </code>
        </p>
      </div>

      {frage.problems.length > 0 ? (
        <ProblemBanner problems={frage.problems} betreff="zu dieser Frage" />
      ) : null}

      {frage.alsoAsked.length > 0 ? (
        <section
          aria-labelledby="auch-gefragt"
          className="rounded-xl border border-rand bg-grund-2 p-4"
        >
          <h2
            id="auch-gefragt"
            className="text-xs font-medium tracking-wide text-schrift-3 uppercase"
          >
            Auch gefragt
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-schrift-2">
            {frage.alsoAsked.map((andere) => (
              <li key={andere}>{andere}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="antwort">
        <h2 id="antwort" className="sr-only">
          Antwort
        </h2>
        {frage.answer.trim() ? (
          <AntwortText text={frage.answer} titles={titles} />
        ) : (
          <Leer titel="Ohne Antwort">
            In dieser Datei steht keine Antwort zwischen den Markern.
          </Leer>
        )}
      </section>

      {frage.spots.length > 0 ? (
        <section
          aria-labelledby="belege"
          className="rounded-xl border border-rand bg-grund-2 p-4"
        >
          <h2
            id="belege"
            className="text-xs font-medium tracking-wide text-schrift-3 uppercase"
          >
            Belege
          </h2>
          <ul className="mt-2 space-y-1">
            {frage.spots.map((spot, index) => {
              const titel = titles[spot.slug];
              const beschriftung = referenceLabel(
                spot.slug,
                spot.target,
                titel,
                formatTimecode,
              );
              if (!titel) {
                return (
                  <li key={index} className="text-sm text-schrift-3">
                    {beschriftung} — diesen Beitrag gibt es hier nicht.
                  </li>
                );
              }
              return (
                <li key={index}>
                  <Link
                    href={referenceHref(spot.slug, spot.target)}
                    className="inline-flex items-center gap-1.5 text-sm text-akzent hover:underline"
                  >
                    <Play aria-hidden className="size-3.5" />
                    {beschriftung}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {settings.chatEnabled && features.authorMode && !features.readonly ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-rand pt-4">
          <ButtonLink href={`/chat?frage=${frage.slug}`} variant="primaer">
            <CornerDownRight aria-hidden className="size-4" />
            Nachfragen
          </ButtonLink>
          <p className="text-xs text-schrift-2">
            Öffnet das Gespräch mit dieser Frage und ihrer Antwort als
            Vorgeschichte — die nächste Frage darf sich darauf beziehen.
          </p>
        </div>
      ) : null}

      {features.authorMode ? (
        <div className="border-t border-rand pt-4">
          <DeleteQuestionButton slug={frage.slug} question={frage.question} />
        </div>
      ) : null}
    </div>
  );
}
