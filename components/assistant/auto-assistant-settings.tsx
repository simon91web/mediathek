"use client";

import { useState, useTransition } from "react";
import { Wand2 } from "lucide-react";

import { setAutoAssistantAction } from "@/app/einstellungen/actions";
import type { ActionResult } from "@/app/einstellungen/actions";
import { Button, Card, SectionTitle } from "@/components/ui/basis";

/*
 * KI-Schritte ohne Fenster — und damit die Kette.
 *
 * Hier wird der Grundsatz aufgeweicht, dass man mitliest, während ein
 * Sprachmodell in die eigenen Dateien schreibt. Deshalb steht der Preis
 * ausdrücklich in der Oberfläche und nicht nur im Code: wer das einschaltet,
 * soll wissen, worauf er verzichtet und was an dessen Stelle tritt.
 */

export function AutoAssistantSettings({
  enabled,
  args,
  chain,
  assistantCommand,
  assistantReady,
}: {
  enabled: boolean;
  args: readonly string[];
  chain: boolean;
  assistantCommand: string;
  assistantReady: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(args.join(" "));
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (an: boolean, argumente: string, kette: boolean) => {
    setResult(null);
    startTransition(async () => {
      setResult(
        await setAutoAssistantAction({
          enabled: an,
          args: argumente,
          chain: kette,
        }),
      );
    });
  };

  return (
    <section>
      <SectionTitle hint="Transkription → Kapitel → Suche → Bezüge">
        Die Kette
      </SectionTitle>
      <Card className="space-y-4">
        <p className="text-sm text-schrift-2">
          Ein neuer Beitrag braucht vier Schritte, und drei davon warten jeweils
          auf den vorigen. Mit dieser Einstellung übernimmt das die
          Auftragsschlange: ein Knopf am Beitrag (
          <span className="inline-flex items-center gap-1 align-middle">
            <Wand2 aria-hidden className="size-3.5" />
            Alles erschließen
          </span>
          ) stellt alles der Reihe nach an.
        </p>

        <label className="flex items-start gap-3 border-t border-rand pt-3">
          <input
            type="checkbox"
            checked={enabled}
            disabled={pending || !assistantReady}
            onChange={(event) => run(event.target.checked, text, chain)}
            className="mt-0.5 accent-akzent"
          />
          <span>
            <span className="text-sm font-medium">
              KI-Schritte ohne Fenster erlauben
            </span>
            <span className="mt-0.5 block text-xs text-schrift-2">
              Sonst öffnet jeder KI-Schritt ein sichtbares Fenster, in dem man
              mitliest — richtig für einen Beitrag, unmöglich für dreißig. Ohne
              Fenster gilt weiterhin der Vertrag aus{" "}
              <code className="rounded bg-grund-3 px-1">anleitungen/</code>:
              geschrieben wird nur zwischen den Markern, alles Handgeschriebene
              bleibt. Und jede Ausgabezeile landet im Protokoll des Auftrags —
              nachlesen statt zusehen.
            </span>
          </span>
        </label>

        {!assistantReady ? (
          <p className="text-xs text-warnung">
            Erst muss das Werkzeug oben gefunden werden.
          </p>
        ) : null}

        <div className="space-y-2 border-t border-rand pt-3">
          <label htmlFor="auto-args" className="block text-sm font-medium">
            Argumente für den unbeaufsichtigten Lauf
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="auto-args"
              type="text"
              value={text}
              spellCheck={false}
              autoComplete="off"
              disabled={pending}
              placeholder="-p --permission-mode acceptEdits"
              onChange={(event) => setText(event.target.value)}
              className="h-9 w-80 rounded-lg border border-rand bg-grund-2 px-2 font-mono text-xs disabled:opacity-50"
            />
            <Button
              size="klein"
              disabled={pending}
              onClick={() => run(enabled, text, chain)}
            >
              Übernehmen
            </Button>
          </div>
          <p className="text-xs text-schrift-2">
            Zwei Dinge muss das Werkzeug hier können: einmalig antworten und
            dabei Dateien ändern dürfen. Bei{" "}
            <code className="rounded bg-grund-3 px-1">{assistantCommand}</code>{" "}
            ist das{" "}
            <code className="rounded bg-grund-3 px-1">
              -p --permission-mode acceptEdits
            </code>
            . Fehlt die Schreiberlaubnis, läuft der Schritt durch und hat nichts
            getan.
          </p>
        </div>

        <label className="flex items-start gap-3 border-t border-rand pt-3">
          <input
            type="checkbox"
            checked={chain}
            disabled={pending || !enabled}
            onChange={(event) => run(enabled, text, event.target.checked)}
            className="mt-0.5 accent-akzent"
          />
          <span>
            <span className="text-sm font-medium">
              Nach einem Import von selbst durchlaufen
            </span>
            <span className="mt-0.5 block text-xs text-schrift-2">
              Dann muss gar kein Knopf mehr gedrückt werden: was importiert
              wird, ist nach einer Weile transkribiert, in Kapitel geteilt,
              durchsuchbar und verknüpft. Aus, wenn man vorher hineinsehen will.
            </span>
          </span>
        </label>

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

        <p className="border-t border-rand pt-3 text-xs text-schrift-3">
          Jeder Lauf steht mit Zeit und Auftragstext im maschinenlokalen
          Protokoll <code>assistent-starts.log</code>. Abbrechen geht jederzeit
          über den Verlauf — das beendet auch den Prozess des Werkzeugs.
        </p>
      </Card>
    </section>
  );
}
