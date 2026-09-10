"use client";

import { useState, useTransition } from "react";
import {
  BookMarked,
  FileStack,
  FolderPlus,
  Layers,
  Terminal,
} from "lucide-react";

import {
  installClaudeFilesAction,
  startLibraryClaudeAction,
} from "@/app/einstellungen/actions";
import { Button, Card, SectionTitle } from "@/components/ui/basis";
import type { ClaudeCommand } from "@/lib/claude/launch";

/*
 * Claude Code für die ganze Bibliothek.
 *
 * Der Handbetrieb ist der eigentliche Weg und steht deshalb hier auch
 * ausdrücklich: in den Bibliotheksordner wechseln, "claude" starten, Befehl
 * eingeben. Die Knöpfe ersparen nur das Tippen — sie sind ein löschbares
 * Zubehör, kein Fundament.
 */

const COMMANDS: Array<{
  command: ClaudeCommand;
  label: string;
  hint: string;
  Icon: typeof Layers;
}> = [
  {
    command: "themen",
    label: "Themenseiten erzeugen",
    hint:
      "Liest alles und legt Wissensgebiete mit Synonymen und Fundstellen an. " +
      "Die Synonyme erweitern anschließend die Suche.",
    Icon: Layers,
  },
  {
    command: "kapitel-alle",
    label: "Alle offenen Kapitel",
    hint:
      "Arbeitet die Beiträge ohne Kapitel in EINER Sitzung ab — dadurch " +
      "bleibt die Wortwahl über alle Beiträge hinweg gleich.",
    Icon: FileStack,
  },
  {
    command: "glossar",
    label: "Glossar sammeln",
    hint:
      "Sammelt Fachbegriffe in glossar.txt. Die Datei geht als hotwords in " +
      "die Transkription — dort ist ein Schreibfehler am billigsten zu " +
      "verhindern.",
    Icon: BookMarked,
  },
];

export function ClaudePanel({
  claudeReady,
  filesInstalled,
  libraryRoot,
}: {
  claudeReady: boolean;
  filesInstalled: boolean;
  libraryRoot: string;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section>
      <SectionTitle hint="erzeugt Kapitel, Zusammenfassungen, Bezüge und Themen">
        Claude Code
      </SectionTitle>
      <Card className="space-y-4">
        <p className="text-sm text-schrift-2">
          Die Mediathek erzeugt diese Texte nicht selbst. Ein Knopf öffnet ein
          sichtbares Fenster im Bibliotheksordner — man liest mit, was in die
          eigenen Dateien geschrieben wird. Dasselbe von Hand:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-grund-3 px-3 py-2 text-xs">
          <code>{`cd ${libraryRoot}\nclaude\n/themen`}</code>
        </pre>

        <div className="space-y-2 border-t border-rand pt-3">
          <p className="text-sm">
            {filesInstalled ? (
              <>
                Der Vertrag liegt in{" "}
                <code className="rounded bg-grund-3 px-1 text-xs">
                  .claude/
                </code>{" "}
                der Bibliothek — Regeln und Befehle wandern mit dem Ordner mit.
              </>
            ) : (
              <>
                In der Bibliothek liegt noch kein{" "}
                <code className="rounded bg-grund-3 px-1 text-xs">
                  .claude/
                </code>
                . Ohne diese Dateien kennt Claude Code die Regeln nicht — etwa
                dass nur zwischen den Markern geschrieben werden darf.
              </>
            )}
          </p>
          <Button
            size="klein"
            variant={filesInstalled ? "sekundaer" : "primaer"}
            disabled={pending}
            onClick={() => run(() => installClaudeFilesAction())}
          >
            <FolderPlus aria-hidden className="size-3.5" />
            {filesInstalled ? "Fehlende Dateien ergänzen" : "Dateien anlegen"}
          </Button>
          <p className="text-xs text-schrift-3">
            Vorhandene Dateien werden nie überschrieben — eine angepasste Regel
            bleibt angepasst.
          </p>
        </div>

        <div className="space-y-3 border-t border-rand pt-3">
          {COMMANDS.map(({ command, label, hint, Icon }) => (
            <div key={command} className="space-y-1">
              <Button
                size="klein"
                disabled={pending || !claudeReady}
                title={
                  claudeReady
                    ? undefined
                    : "Claude Code wurde auf dieser Maschine nicht gefunden."
                }
                onClick={() => run(() => startLibraryClaudeAction(command))}
              >
                <Icon aria-hidden className="size-3.5" />
                {label}
              </Button>
              <p className="text-xs text-schrift-2">{hint}</p>
            </div>
          ))}
        </div>

        {!claudeReady ? (
          <p className="flex items-start gap-2 border-t border-rand pt-3 text-xs text-schrift-2">
            <Terminal aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Claude Code wurde nicht gefunden. Die Knöpfe bleiben aus; der
              Handbetrieb oben funktioniert, sobald es installiert ist.
            </span>
          </p>
        ) : null}

        {note ? <p className="text-sm text-akzent">{note}</p> : null}
        {error ? <p className="text-sm text-warnung">{error}</p> : null}
      </Card>
    </section>
  );
}
