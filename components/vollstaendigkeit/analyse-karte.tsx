"use client";

import { useState, useTransition } from "react";
import { Loader2, Radar } from "lucide-react";

import { analyzeCompletenessAction } from "@/app/themen/actions";
import { Button, Card } from "@/components/ui/basis";
import { STUFE_CLASS, STUFE_LABEL } from "./stufe";
import type { Stufe } from "@/lib/library/types";

/*
 * Die Übersichtskarte auf /themen: Fachfremd ist immer da (reiner
 * Textabgleich, siehe lib/library/completeness.ts), Fachkundig erst nach dem
 * ersten Lauf von "Lücken analysieren". Der Knopf stellt dafür einen Auftrag
 * in die vorhandene Schlange, wie schon "Fragen aufräumen" — kein Fenster,
 * in dem man danebensitzen müsste.
 */

function formatiereZeitpunkt(iso: string): string {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return iso;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(datum);
}

export function AnalyseKarte({
  geprueftAm,
  fachfremdStufe,
  fachfremdOk,
  fachfremdGesamt,
  fachkundigStufe,
  fachkundigHinweis,
}: {
  geprueftAm: string | null;
  fachfremdStufe: Stufe;
  fachfremdOk: number;
  fachfremdGesamt: number;
  fachkundigStufe: Stufe;
  /** Zählung als fertiger Satz, z. B. "3 unbelegte Zahlen · 1 Widerspruch". */
  fachkundigHinweis: string;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <Card className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold">
          Vollständigkeit der Mediathek
        </span>
        <span className="text-xs text-schrift-3">
          {geprueftAm
            ? `Zuletzt geprüft: ${formatiereZeitpunkt(geprueftAm)}`
            : "Noch nie geprüft"}
        </span>
      </div>

      <div className="flex flex-wrap gap-10">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-wide text-schrift-2 uppercase">
            Fachfremd
          </span>
          <span
            className={`inline-flex w-fit items-center rounded-md px-2.5 py-0.5 text-sm font-semibold ${STUFE_CLASS[fachfremdStufe]}`}
          >
            {STUFE_LABEL[fachfremdStufe]}
          </span>
          <span className="text-xs text-schrift-2">
            {fachfremdOk} von {fachfremdGesamt} Themen ohne Befund
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-wide text-schrift-2 uppercase">
            Fachkundig
          </span>
          <span
            className={`inline-flex w-fit items-center rounded-md px-2.5 py-0.5 text-sm font-semibold ${STUFE_CLASS[fachkundigStufe]}`}
          >
            {STUFE_LABEL[fachkundigStufe]}
          </span>
          <span className="text-xs text-schrift-2">{fachkundigHinweis}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-rand pt-3">
        <Button
          size="klein"
          disabled={pending}
          onClick={() => {
            setNote(null);
            startTransition(async () => {
              const result = await analyzeCompletenessAction();
              setNote(
                result.ok
                  ? { ok: true, text: result.message }
                  : { ok: false, text: result.error },
              );
            });
          }}
        >
          {pending ? (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          ) : (
            <Radar aria-hidden className="size-3.5" />
          )}
          {pending ? "Wird angestellt …" : "Lücken analysieren"}
        </Button>
        <span className="text-xs text-schrift-3">
          Läuft als Auftrag im Hintergrund, dauert je nach Bestand einige
          Minuten.
        </span>
      </div>

      {note ? (
        <p className={`text-xs ${note.ok ? "text-akzent" : "text-warnung"}`}>
          {note.text}
        </p>
      ) : null}
    </Card>
  );
}
