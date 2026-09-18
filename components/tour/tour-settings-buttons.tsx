"use client";

import { Compass, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/basis";
import { tourStore } from "@/lib/tour/tour-store";

/*
 * Zwei Wiederholen-Knöpfe für die Programm-Einstellungen.
 *
 * Keine Server Action nötig: das Zeigen einer Tour ändert keinen
 * gespeicherten Zustand, es stößt nur den Client-Store an — <TourOverlay/>
 * in app/layout.tsx reagiert darauf und navigiert selbst zur passenden Seite.
 */

export function TourSettingsButtons({
  hasDemoItem,
}: {
  /** false bei einer leeren Bibliothek — dann gibt es nichts vorzuführen. */
  hasDemoItem: boolean;
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Compass aria-hidden className="size-4 text-akzent" />
            Rundgang durch die Mediathek
          </p>
          <p className="mt-0.5 max-w-sm text-xs text-schrift-2">
            Kopfzeile, Suche, Verlauf und ein Beitrag im Detail — einmal
            alles gezeigt. Öffnet sich automatisch beim ersten Start.
          </p>
        </div>
        <Button size="klein" onClick={() => tourStore.start("platform")}>
          Erneut anzeigen
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-rand pt-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Wand2 aria-hidden className="size-4 text-akzent" />
            Inhalte einpflegen und aufbereiten
          </p>
          <p className="mt-0.5 max-w-sm text-xs text-schrift-2">
            {hasDemoItem
              ? "Import, Kette und Kapitel am Beispiel eines Beitrags. Wird nicht automatisch gezeigt."
              : "Braucht mindestens einen Beitrag zum Vorführen — sobald einer importiert ist, lässt sie sich hier anzeigen."}
          </p>
        </div>
        <Button
          size="klein"
          disabled={!hasDemoItem}
          onClick={() => tourStore.start("workflow")}
        >
          Anzeigen
        </Button>
      </div>
    </>
  );
}
