"use client";

import { Dialog, VisuallyHidden } from "radix-ui";
import { Radar, X } from "lucide-react";

import type { VollstaendigkeitSummary } from "@/lib/library/completeness";
import { AnalyseKarte } from "./analyse-karte";
import { STUFE_CLASS, STUFE_LABEL } from "./stufe";

/*
 * Der schnelle Zugriff auf /themen: eine Pille mit der Fachfremd-Stufe auf
 * den ersten Blick, ein Klick öffnet mittig dieselbe Karte, die auch unter
 * Einstellungen → KI-Assistent fest steht (AnalyseKarte) — eine Stelle für
 * Inhalt und Knopf, zwei Orte, an denen sie auftaucht.
 *
 * Ein Dialog statt eines Popovers: die Karte soll bewusst auffallen, mit
 * abgedunkeltem/verwischtem Rest der Seite dahinter — kein beiläufiger
 * Hinweis am Rand.
 */

export function VollstaendigkeitDialog(props: VollstaendigkeitSummary) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-rand bg-grund-2 px-3 py-2 text-sm text-schrift hover:bg-grund-3"
        >
          <Radar aria-hidden className="size-4 text-schrift-2" />
          Vollständigkeit
          <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${STUFE_CLASS[props.fachfremdStufe]}`}
          >
            {STUFE_LABEL[props.fachfremdStufe]}
          </span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 w-full max-w-md
            -translate-x-1/2 -translate-y-1/2 rounded-xl shadow-2xl outline-none
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
            data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <VisuallyHidden.Root asChild>
            <Dialog.Title>Vollständigkeit der Mediathek</Dialog.Title>
          </VisuallyHidden.Root>
          <VisuallyHidden.Root asChild>
            <Dialog.Description>
              Score je Sichtweise und Auslöser für die Lücken-Analyse.
            </Dialog.Description>
          </VisuallyHidden.Root>
          <AnalyseKarte {...props} />
          {/*
            Am äußeren Rand der Karte, nicht innen: AnalyseKarte hat oben
            rechts schon das Prüfdatum stehen, ein Knopf mittendrin würde das
            überlagern.
          */}
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Schließen"
              className="absolute -top-3 -right-3 rounded-full border border-rand bg-grund-2 p-1.5 text-schrift-2 shadow-md hover:bg-grund-3 hover:text-schrift"
            >
              <X aria-hidden className="size-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
