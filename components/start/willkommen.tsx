"use client";

import { AlertTriangle, ArrowRight, Library } from "lucide-react";

import { LibraryChooser } from "@/components/library/library-chooser";

/*
 * Der erste Bildschirm, den jemand von diesem Programm sieht.
 *
 * Er hat genau eine Aufgabe: zu klären, wo die Bibliothek liegt. Deshalb
 * steht hier nichts anderes — keine Navigation, keine Einstellungen, kein
 * „später".
 *
 * DIE EINE REGEL, DIE DIESEN SCHIRM BESTIMMT: Man muss den Pfad SEHEN, bevor
 * man klickt. Ein Knopf, nach dem irgendwo auf der Platte ein Ordner
 * entstanden ist, den man nicht wiederfindet, ist schlimmer als eine Frage
 * mehr.
 *
 * Später dieselbe Wahl unter Einstellungen — der Ordner ist nicht für immer
 * festgelegt, nur für diesen Start gemerkt.
 */

export function Willkommen({
  lostDir,
  suggestedParent,
  suggestedName,
  pathExample,
}: {
  /** Ein gemerkter Ordner, der nicht mehr erreichbar ist. */
  lostDir: string | null;
  suggestedParent: string;
  suggestedName: string;
  /** Beispielpfad fürs Einfügen — Windows UNC/Laufwerk oder macOS /Volumes. */
  pathExample: string;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-10">
      <div>
        <p className="flex items-center gap-2 text-sm text-schrift-2">
          <Library aria-hidden className="size-4 text-akzent" />
          Mediathek
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Wo sollen die Aufnahmen liegen?
        </h1>
        <p className="mt-2 text-sm text-schrift-2">
          Alles, was diese Mediathek zeigt, steht in einem gewöhnlichen Ordner:
          die Videos, die Transkripte, die Notizen. Der Ordner darf auf einem
          Netzlaufwerk liegen und lässt sich jederzeit weitergeben oder
          umstellen.
        </p>
      </div>

      {lostDir ? (
        <p className="flex items-start gap-2 rounded-xl border border-warnung/40 bg-warnung-grund px-4 py-3 text-sm text-warnung">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Zuletzt lag die Bibliothek in <code>{lostDir}</code> — der Ordner
            ist gerade nicht erreichbar. Bei einem Netzlaufwerk genügt oft,
            es zu verbinden und das Programm neu zu starten.
          </span>
        </p>
      ) : null}

      <LibraryChooser
        pathExample={pathExample}
        suggestedParent={suggestedParent}
        suggestedName={suggestedName}
      />

      <p className="flex items-center gap-1.5 text-xs text-schrift-3">
        <ArrowRight aria-hidden className="size-3" />
        Später umstellen geht jederzeit unter Einstellungen oder über
        Werkzeuge → Bibliothek wechseln.
      </p>
    </div>
  );
}
