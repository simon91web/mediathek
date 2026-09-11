"use client";

import { useState, useTransition } from "react";
import {
  BookMarked,
  FileStack,
  FolderPlus,
  Layers,
  MessagesSquare,
  Terminal,
} from "lucide-react";

import {
  installInstructionsAction,
  setAssistantCommandAction,
  startLibraryAssistantAction,
} from "@/app/einstellungen/actions";
import { Button, Card, SectionTitle } from "@/components/ui/basis";
import type { AssistantTask } from "@/lib/assistant/start";

/*
 * Der KI-Assistent für die ganze Bibliothek.
 *
 * Werkzeugunabhängig: welches Programm gerufen wird, steht in den
 * Einstellungen. Die Anleitungen in der Bibliothek beschreiben nur Dateien
 * und Formate — sie setzen kein bestimmtes Programm voraus.
 *
 * Der Handbetrieb ist der eigentliche Weg und steht deshalb hier auch
 * ausdrücklich. Die Knöpfe ersparen nur das Tippen; sie sind ein löschbares
 * Zubehör, kein Fundament.
 */

const TASKS: Array<{
  task: AssistantTask;
  label: string;
  hint: string;
  Icon: typeof Layers;
}> = [
  {
    task: "themen",
    label: "Themenseiten erzeugen",
    hint:
      "Liest alles und legt Wissensgebiete mit Synonymen und Fundstellen an. " +
      "Die Synonyme erweitern anschließend die Suche.",
    Icon: Layers,
  },
  {
    task: "kapitel-alle",
    label: "Alle offenen Kapitel",
    hint:
      "Arbeitet die Beiträge ohne Kapitel in EINER Sitzung ab — dadurch " +
      "bleibt die Wortwahl über alle Beiträge hinweg gleich.",
    Icon: FileStack,
  },
  {
    task: "fragen",
    label: "Fragen zusammenfassen",
    hint:
      "Räumt fragen/ auf: gleichartige Fragen werden zu einem Eintrag, die " +
      "anderen Formulierungen wandern in „auch gefragt“. Ohne das wächst " +
      "der Bestand, aber er ordnet sich nicht.",
    Icon: MessagesSquare,
  },
  {
    task: "glossar",
    label: "Glossar sammeln",
    hint:
      "Sammelt Fachbegriffe in glossar.txt. Die Datei geht als hotwords in " +
      "die Transkription — dort ist ein Schreibfehler am billigsten zu " +
      "verhindern.",
    Icon: BookMarked,
  },
];

export function AssistantPanel({
  assistantReady,
  assistantCommand,
  assistantArgs,
  instructionsInstalled,
  libraryRoot,
}: {
  assistantReady: boolean;
  assistantCommand: string;
  assistantArgs: readonly string[];
  instructionsInstalled: boolean;
  libraryRoot: string;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState(assistantCommand);
  const [args, setArgs] = useState(assistantArgs.join(" "));

  const run = (
    task: () => Promise<{ ok: boolean; message?: string; error?: string }>,
  ) => {
    setNote(null);
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (result.ok) setNote(result.message ?? "Fertig.");
      else setError(result.error ?? "Fehlgeschlagen.");
    });
  };

  const aufruf = [command, ...args.split(/\s+/).filter(Boolean)].join(" ");

  return (
    <section>
      <SectionTitle hint="erzeugt Kapitel, Zusammenfassungen, Bezüge und Themen">
        KI-Assistent
      </SectionTitle>
      <Card className="space-y-4">
        <p className="text-sm text-schrift-2">
          Die Mediathek erzeugt diese Texte nicht selbst. Jeder Knopf hier
          öffnet ein <strong>eigenes Konsolenfenster</strong> im
          Bibliotheksordner und gibt dort einen Auftrag ein. Gearbeitet wird
          dann in jenem Fenster: man liest mit, was in die eigenen Dateien
          geschrieben wird, und kann nachfragen oder abbrechen. Es kann hinter
          dem Browser aufgehen.
        </p>

        {/* --------------------------------------------------- Werkzeug */}
        <div className="space-y-2 border-t border-rand pt-3">
          <p className="text-sm font-medium">Werkzeug</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={command}
              spellCheck={false}
              autoComplete="off"
              disabled={pending}
              aria-label="Programm"
              placeholder="claude"
              onChange={(event) => setCommand(event.target.value)}
              className="h-9 w-40 rounded-lg border border-rand bg-grund-2 px-2 font-mono text-xs disabled:opacity-50"
            />
            <input
              type="text"
              value={args}
              spellCheck={false}
              autoComplete="off"
              disabled={pending}
              aria-label="Argumente vor dem Auftrag"
              placeholder="ohne"
              onChange={(event) => setArgs(event.target.value)}
              className="h-9 w-32 rounded-lg border border-rand bg-grund-2 px-2 font-mono text-xs disabled:opacity-50"
            />
            <Button
              size="klein"
              disabled={pending}
              onClick={() =>
                run(() => setAssistantCommandAction({ command, args }))
              }
            >
              Übernehmen und prüfen
            </Button>
          </div>
          <p className="text-xs text-schrift-2">
            Nur der Programmname, kein Pfad — es muss im Suchpfad stehen.
            Geprüft wird mit{" "}
            <code className="rounded bg-grund-3 px-1">{command} --version</code>
            . Das zweite Feld nimmt Argumente, die manche Werkzeuge vor dem
            Auftrag brauchen (etwa{" "}
            <code className="rounded bg-grund-3 px-1">-p</code> oder{" "}
            <code className="rounded bg-grund-3 px-1">exec</code>).
          </p>
          <p className="text-xs text-schrift-3">
            Erprobt ist auf dieser Maschine nur{" "}
            <code className="rounded bg-grund-3 px-1">claude</code>. Andere
            Werkzeuge sollten gehen, solange sie einen Auftragstext als Argument
            annehmen und Dateien im Arbeitsverzeichnis lesen dürfen — geprüft
            habe ich das nicht.
          </p>
        </div>

        {/* ------------------------------------------------- Handbetrieb */}
        <div className="space-y-2 border-t border-rand pt-3">
          <p className="text-sm">Dasselbe von Hand:</p>
          <pre className="overflow-x-auto rounded-lg bg-grund-3 px-3 py-2 text-xs">
            <code>{`cd ${libraryRoot}\n${aufruf} "Befolge die Anweisungen in anleitungen/themen.md."`}</code>
          </pre>
        </div>

        {/* ------------------------------------------------- Anleitungen */}
        <div className="space-y-2 border-t border-rand pt-3">
          <p className="text-sm">
            {instructionsInstalled ? (
              <>
                Die Anleitungen liegen in{" "}
                <code className="rounded bg-grund-3 px-1 text-xs">
                  anleitungen/
                </code>{" "}
                der Bibliothek — sie wandern mit dem Ordner mit und gelten für
                jedes Werkzeug.
              </>
            ) : (
              <>
                In der Bibliothek liegt noch kein{" "}
                <code className="rounded bg-grund-3 px-1 text-xs">
                  anleitungen/
                </code>
                . Ohne diese Dateien kennt das Werkzeug die Regeln nicht — etwa
                dass nur zwischen den Markern geschrieben werden darf.
              </>
            )}
          </p>
          <Button
            size="klein"
            variant={instructionsInstalled ? "sekundaer" : "primaer"}
            disabled={pending}
            onClick={() => run(() => installInstructionsAction())}
          >
            <FolderPlus aria-hidden className="size-3.5" />
            {instructionsInstalled
              ? "Fehlende Dateien ergänzen"
              : "Anleitungen anlegen"}
          </Button>
          <p className="text-xs text-schrift-3">
            Angelegt werden{" "}
            <code className="rounded bg-grund-3 px-1">anleitungen/</code>, ein{" "}
            <code className="rounded bg-grund-3 px-1">AGENTS.md</code> als
            Einstieg und die Abkürzungen in{" "}
            <code className="rounded bg-grund-3 px-1">.claude/</code> für Claude
            Code. Vorhandene Dateien werden nie überschrieben.
          </p>
        </div>

        {/* --------------------------------------------------- Aufgaben */}
        <div className="space-y-3 border-t border-rand pt-3">
          {TASKS.map(({ task, label, hint, Icon }) => (
            <div key={task} className="space-y-1">
              <Button
                size="klein"
                disabled={pending || !assistantReady}
                title={
                  assistantReady
                    ? undefined
                    : `"${assistantCommand}" wurde auf dieser Maschine nicht gefunden.`
                }
                onClick={() => run(() => startLibraryAssistantAction(task))}
              >
                <Icon aria-hidden className="size-3.5" />
                {label}
              </Button>
              <p className="text-xs text-schrift-2">{hint}</p>
            </div>
          ))}
        </div>

        {!assistantReady ? (
          <p className="flex items-start gap-2 border-t border-rand pt-3 text-xs text-schrift-2">
            <Terminal aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              „{assistantCommand}“ wurde nicht gefunden. Die Knöpfe bleiben aus;
              der Handbetrieb oben funktioniert, sobald das Werkzeug installiert
              ist.
            </span>
          </p>
        ) : null}

        {/*
          Deutlich abgesetzt und nicht als grauer Nachsatz: die Rückmeldung
          ist bei diesen Knöpfen das Einzige, woran man überhaupt erkennt, ob
          etwas passiert ist — das Fenster geht woanders auf.
        */}
        {note ? (
          <p className="rounded-lg border border-akzent/40 bg-akzent/10 px-3 py-2 text-sm text-akzent">
            {note}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-warnung/40 bg-warnung-grund px-3 py-2 text-sm text-warnung">
            {error}
          </p>
        ) : null}
      </Card>
    </section>
  );
}
