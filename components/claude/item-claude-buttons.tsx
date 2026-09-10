"use client";

import { useState, useTransition } from "react";
import { Link2, Terminal } from "lucide-react";

import { startClaudeAction } from "@/app/medien/[slug]/actions";
import { Button } from "@/components/ui/basis";
import type { ClaudeCommand } from "@/lib/claude/launch";

/*
 * Die zwei Knöpfe am Beitrag, die Claude Code holen.
 *
 * Sie erzeugen nichts selbst — sie öffnen ein sichtbares PowerShell-Fenster
 * im Bibliotheksordner. Danach passiert alles dort, und man liest mit. Wenn
 * das Fenster fertig ist, meldet der Verzeichnis-Beobachter die geänderte
 * beitrag.md und die Seite zeigt die neuen Kapitel — ohne Serverneustart.
 */

export function ItemClaudeButtons({
  slug,
  kind,
  hasTranscript,
  claudeReady,
}: {
  slug: string;
  kind: "video" | "audio" | "text";
  hasTranscript: boolean;
  claudeReady: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * Ohne Transkript hat Claude Code bei Video und Audio keine Quelle. Es
   * anhand des Titels raten zu lassen wäre genau das, was die Regeln in der
   * Bibliothek verbieten.
   */
  const hasSource = kind === "text" || hasTranscript;

  const start = (command: ClaudeCommand) => {
    setNote(null);
    setError(null);
    startTransition(async () => {
      const result = await startClaudeAction(command, slug);
      if (result.ok) setNote(`Fenster offen: ${result.prompt}`);
      else setError(result.error);
    });
  };

  const missing = !claudeReady
    ? "Claude Code wurde auf dieser Maschine nicht gefunden."
    : !hasSource
      ? "Erst transkribieren — ohne Transkript gibt es keine Quelle."
      : undefined;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="klein"
          disabled={pending || !claudeReady || !hasSource}
          title={missing}
          onClick={() => start("kapitel")}
        >
          <Terminal aria-hidden className="size-3.5" />
          Kapitel per Claude Code
        </Button>
        <Button
          size="klein"
          disabled={pending || !claudeReady || !hasSource}
          title={missing}
          onClick={() => start("bezuege")}
        >
          <Link2 aria-hidden className="size-3.5" />
          Verwandte Stellen suchen
        </Button>
      </div>

      {note ? (
        <p className="text-xs text-schrift-2">
          {note} — im Fenster mitlesen; die Seite zeigt die Änderung von selbst,
          sobald die Datei geschrieben ist.
        </p>
      ) : null}
      {error ? <p className="text-xs text-warnung">{error}</p> : null}
    </div>
  );
}
