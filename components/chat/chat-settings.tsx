"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Globe, MessageSquare } from "lucide-react";

import { setChatAction } from "@/app/einstellungen/actions";
import type { ActionResult } from "@/app/einstellungen/actions";
import { Button, Card, SectionTitle } from "@/components/ui/basis";

/*
 * Der Chat wird ausdrücklich eingeschaltet.
 *
 * Nicht aus Vorsicht um der Vorsicht willen: jede Frage startet ein Programm
 * auf dieser Maschine, das die ganze Bibliothek lesen darf und — je nach
 * Werkzeug — Geld oder Kontingent kostet. Etwas, das das tut, soll nicht
 * einfach da sein, weil man die Mediathek installiert hat.
 */

export function ChatSettings({
  enabled,
  chatArgs,
  webAllowed,
  chatWebArgs,
  assistantCommand,
  assistantReady,
}: {
  enabled: boolean;
  chatArgs: readonly string[];
  webAllowed: boolean;
  chatWebArgs: readonly string[];
  assistantCommand: string;
  assistantReady: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [args, setArgs] = useState(chatArgs.join(" "));
  const [webArgs, setWebArgs] = useState(chatWebArgs.join(" "));
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (
    an: boolean,
    argumente: string,
    netz = webAllowed,
    netzArgumente = webArgs,
  ) => {
    setResult(null);
    startTransition(async () => {
      setResult(
        await setChatAction({
          enabled: an,
          args: argumente,
          webAllowed: netz,
          webArgs: netzArgumente,
        }),
      );
    });
  };

  return (
    <section>
      <SectionTitle hint="Fragen an das eigene Material">Chat</SectionTitle>
      <Card className="space-y-4">
        <p className="text-sm text-schrift-2">
          Ein Gespräch über die Bibliothek, ähnlich wie in NotebookLM — nur dass
          es auf dieser Maschine läuft und ausschließlich aus den eigenen
          Dateien antwortet: Transkripte, Beiträge, Themen. Mit Beitrag und
          Zeitmarke als Beleg.
        </p>

        <label className="flex items-start gap-3 border-t border-rand pt-3">
          <input
            type="checkbox"
            checked={enabled}
            disabled={pending || !assistantReady}
            onChange={(event) => run(event.target.checked, args)}
            className="mt-0.5 accent-akzent"
          />
          <span>
            <span className="text-sm font-medium">Chat einschalten</span>
            <span className="mt-0.5 block text-xs text-schrift-2">
              Jede Frage startet{" "}
              <code className="rounded bg-grund-3 px-1">
                {assistantCommand}
              </code>{" "}
              im Bibliotheksordner und liest dessen Antwort zurück. Das Gespräch
              wird nirgends gespeichert und ist nach dem Schließen der Seite
              weg.
            </span>
          </span>
        </label>

        {!assistantReady ? (
          <p className="text-xs text-warnung">
            Erst muss das Werkzeug oben gefunden werden — ohne das gibt es
            niemanden, der antwortet.
          </p>
        ) : null}

        <div className="space-y-2 border-t border-rand pt-3">
          <label htmlFor="chat-args" className="block text-sm font-medium">
            Argumente für den einmaligen Aufruf
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="chat-args"
              type="text"
              value={args}
              spellCheck={false}
              autoComplete="off"
              disabled={pending}
              placeholder="-p"
              onChange={(event) => setArgs(event.target.value)}
              className="h-9 w-32 rounded-lg border border-rand bg-grund-2 px-2 font-mono text-xs disabled:opacity-50"
            />
            <Button
              size="klein"
              disabled={pending}
              onClick={() => run(enabled, args)}
            >
              Übernehmen
            </Button>
          </div>
          <p className="text-xs text-schrift-2">
            Der Chat ruft das Werkzeug EINMALIG auf und erwartet eine Antwort
            auf der Standardausgabe — anders als die Knöpfe oben, die ein
            Fenster öffnen. Dafür braucht es meist ein eigenes Wort:{" "}
            <code className="rounded bg-grund-3 px-1">-p</code> bei claude,{" "}
            <code className="rounded bg-grund-3 px-1">exec</code> bei codex. Die
            Frage selbst geht über die Standardeingabe, nicht über die
            Kommandozeile — deshalb darf sie beliebig lang sein und
            Sonderzeichen enthalten.
          </p>
        </div>

        <div className="space-y-2 border-t border-rand pt-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={webAllowed}
              disabled={pending || !enabled}
              onChange={(event) =>
                run(enabled, args, event.target.checked, webArgs)
              }
              className="mt-0.5 accent-akzent"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Globe aria-hidden className="size-4" />
                Das Internet als zusätzliche Quelle erlauben
              </span>
              <span className="mt-0.5 block text-xs text-schrift-2">
                Schaltet im Chat einen Schalter frei: „Internet mitlesen“. Er
                ist an jeder Frage einzeln zu setzen und standardmäßig aus — die
                Mediathek antwortet aus dem eigenen Material, und das soll sie
                auch. Was aus dem Netz stammt, wird in der Antwort ausdrücklich
                als solches gekennzeichnet.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2 pl-7">
            <label htmlFor="chat-web-args" className="text-xs text-schrift-2">
              Zusätzliche Argumente dafür
            </label>
            <input
              id="chat-web-args"
              type="text"
              value={webArgs}
              spellCheck={false}
              autoComplete="off"
              disabled={pending || !webAllowed}
              placeholder="--allowedTools WebSearch"
              onChange={(event) => setWebArgs(event.target.value)}
              className="h-9 w-64 rounded-lg border border-rand bg-grund-2 px-2 font-mono text-xs disabled:opacity-50"
            />
            <Button
              size="klein"
              disabled={pending || !webAllowed}
              onClick={() => run(enabled, args, webAllowed, webArgs)}
            >
              Übernehmen
            </Button>
          </div>
          <p className="pl-7 text-xs text-schrift-2">
            Werkzeugsache: die meisten Kommandozeilenwerkzeuge suchen nur dann
            im Netz, wenn man es ihnen ausdrücklich erlaubt. Bei claude ist das{" "}
            <code className="rounded bg-grund-3 px-1">
              --allowedTools WebSearch
            </code>
            .
          </p>
        </div>

        {result ? (
          <p
            className={
              result.ok
                ? "rounded-lg border border-akzent/40 bg-akzent/10 px-3 py-2 text-sm text-akzent"
                : "rounded-lg border border-warnung/40 bg-warnung-grund px-3 py-2 text-sm text-warnung"
            }
          >
            {result.ok ? result.message : result.error}
          </p>
        ) : null}

        {enabled ? (
          <p className="flex items-center gap-2 border-t border-rand pt-3 text-sm">
            <MessageSquare
              aria-hidden
              className="size-4 shrink-0 text-akzent"
            />
            <Link href="/chat" className="text-akzent hover:underline">
              Zum Chat
            </Link>
            <span className="text-xs text-schrift-3">
              — auch über das Symbol in der Kopfzeile
            </span>
          </p>
        ) : null}
      </Card>
    </section>
  );
}
