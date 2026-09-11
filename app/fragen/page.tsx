import type { Metadata } from "next";
import Link from "next/link";
import { Globe, MessageSquare, Search } from "lucide-react";

import { AntwortText } from "@/components/fragen/antwort-text";
import { TidyQuestionsButton } from "@/components/fragen/tidy-button";
import { ButtonLink, Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { getLibrary, listQuestions } from "@/lib/library";
import { readSettings } from "@/lib/settings";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Fragen" };

/*
 * Das FAQ, wie es entsteht: nicht geschrieben, sondern angefallen.
 *
 * Jede im Chat beantwortete Frage liegt als Datei in fragen/. Diese Seite ist
 * die Liste davon, und der Knopf beim Assistenten fasst zusammen, was
 * dasselbe meint.
 *
 * Gesucht wird über die Adresse (?q=), nicht im Browser: so ist eine
 * gefilterte Liste teilbar und überlebt einen Neuladen — und die Seite
 * braucht kein Stück Client-JavaScript.
 */

export default async function FragenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const suche = q?.trim() ?? "";

  const [alle, treffer, library, features, settings] = await Promise.all([
    listQuestions(),
    listQuestions({ search: suche }),
    getLibrary(),
    getFeatures(),
    readSettings(),
  ]);

  // Wie in der Kopfzeile: der Chat ist nur da, wo er auch laufen darf.
  const chatAn =
    settings.chatEnabled && features.authorMode && !features.readonly;

  const titles = Object.fromEntries(
    library.items.map((item) => [item.slug, item.title]),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fragen</h1>
          <p className="mt-1 text-sm text-schrift-2">
            Was schon einmal gefragt wurde, mit der Antwort und ihren Belegen.
            Der Bestand wächst von selbst: jede Frage aus dem Chat landet hier.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {alle.length > 1 && features.authorMode ? (
            <TidyQuestionsButton />
          ) : null}
          {chatAn ? (
            <ButtonLink href="/chat" variant="primaer">
              <MessageSquare aria-hidden className="size-4" />
              Neue Frage stellen
            </ButtonLink>
          ) : null}
        </div>
      </div>

      {alle.length > 0 ? (
        <form method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-schrift-3"
            />
            <input
              type="search"
              name="q"
              defaultValue={suche}
              placeholder="In den Fragen suchen"
              aria-label="In den Fragen suchen"
              className="w-full rounded-lg border border-rand bg-grund-2 py-2 pr-3 pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-schrift-3">
            {suche
              ? `${plural(treffer.length, "Treffer", "Treffer")} von ${alle.length}`
              : plural(alle.length, "Frage", "Fragen")}
          </span>
        </form>
      ) : null}

      {alle.length === 0 ? (
        <Leer titel="Noch keine Fragen">
          Hier sammelt sich, was im Chat gefragt und beantwortet wurde — eine
          Datei je Frage in{" "}
          <code className="rounded bg-grund-3 px-1">fragen/</code>. Von Hand
          angelegt geht auch: ein Kopf mit{" "}
          <code className="rounded bg-grund-3 px-1">frage:</code> und die
          Antwort zwischen{" "}
          <code className="rounded bg-grund-3 px-1">
            &lt;!-- antwort:start --&gt;
          </code>{" "}
          und{" "}
          <code className="rounded bg-grund-3 px-1">
            &lt;!-- antwort:ende --&gt;
          </code>
          .
        </Leer>
      ) : treffer.length === 0 ? (
        <Leer titel="Dazu gibt es noch nichts">
          Keine der abgelegten Fragen enthält „{suche}“.{" "}
          <Link href="/fragen" className="text-akzent hover:underline">
            Filter aufheben
          </Link>
          {chatAn ? (
            <>
              {" "}
              — oder{" "}
              <Link href="/chat" className="text-akzent hover:underline">
                im Chat fragen
              </Link>
              .
            </>
          ) : null}
        </Leer>
      ) : (
        <ul className="space-y-3">
          {treffer.map((frage) => (
            <li
              key={frage.slug}
              className="rounded-xl border border-rand bg-grund-2 p-4"
            >
              <Link
                href={`/fragen/${frage.slug}`}
                className="font-medium hover:text-akzent"
              >
                {frage.question}
              </Link>

              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-schrift-3">
                {frage.askedAt ? <span>{frage.askedAt}</span> : null}
                {frage.spots.length > 0 ? (
                  <span>{plural(frage.spots.length, "Beleg", "Belege")}</span>
                ) : null}
                {frage.alsoAsked.length > 0 ? (
                  <span>
                    {plural(
                      frage.alsoAsked.length,
                      "weitere Formulierung",
                      "weitere Formulierungen",
                    )}
                  </span>
                ) : null}
                {frage.usedWeb ? (
                  <span className="inline-flex items-center gap-1">
                    <Globe aria-hidden className="size-3" />
                    mit Internet
                  </span>
                ) : null}
              </p>

              <AntwortText
                text={kurz(frage.answer)}
                titles={titles}
                className="mt-2 text-schrift-2"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Der Anfang der Antwort. Die ganze steht auf der Seite der Frage. */
function kurz(answer: string): string {
  const ersterAbsatz = answer.split(/\n{2,}/)[0] ?? "";
  if (ersterAbsatz.length <= 320) return ersterAbsatz;
  /*
   * Abgeschnitten wird an einer Leerstelle, nie mitten in einem Verweis:
   * ein halbes [[kennung#04:25]] wäre danach nur noch Text.
   */
  const schnitt = ersterAbsatz.lastIndexOf(" ", 320);
  return `${ersterAbsatz.slice(0, schnitt > 200 ? schnitt : 320)} …`;
}
