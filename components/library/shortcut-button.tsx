"use client";

import { useState, useTransition } from "react";
import { MonitorDown } from "lucide-react";

import { createShortcutAction } from "@/app/einstellungen/actions";
import { Button } from "@/components/ui/basis";

/*
 * Eine Verknüpfung auf dem Schreibtisch — mit Symbol und ohne Konsolenfenster.
 *
 * Der Knopf erscheint nur, wenn hier wirklich ein gepacktes Programm läuft:
 * im Entwicklungsbetrieb gibt es die Starter-Datei nicht, und ein Knopf, der
 * auf etwas Nichtvorhandenes zeigt, ist schlimmer als keiner.
 */

export function ShortcutButton() {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="space-y-2">
      <Button
        size="klein"
        disabled={pending}
        onClick={() => {
          setNote(null);
          startTransition(async () => {
            const result = await createShortcutAction();
            setNote(
              result.ok
                ? { ok: true, text: result.message }
                : { ok: false, text: result.error },
            );
          });
        }}
      >
        <MonitorDown aria-hidden className="size-3.5" />
        {pending ? "Wird angelegt …" : "Verknüpfung auf dem Schreibtisch"}
      </Button>
      <p className="text-xs text-schrift-2">
        Startet die Mediathek in einem eigenen Fenster, ohne schwarzen Kasten.
        Sie zeigt auf den Ort, an dem das Programm jetzt liegt — wird der Ordner
        später verschoben, hier einfach eine neue anlegen.
      </p>
      {note ? (
        <p
          className={`text-xs break-all ${note.ok ? "text-akzent" : "text-warnung"}`}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
