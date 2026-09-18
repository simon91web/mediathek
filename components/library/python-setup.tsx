"use client";

import { useState, useTransition } from "react";
import { PackagePlus } from "lucide-react";

import { setupPythonAction } from "@/app/einstellungen/actions";
import type { ActionResult } from "@/app/einstellungen/actions";
import { Button } from "@/components/ui/basis";

/*
 * Die Python-Umgebung einrichten — auf Knopfdruck.
 *
 * Vorher stand hier „einzurichten mit npm run setup:python". Im
 * weitergegebenen Paket gibt es aber weder npm noch ein package.json: die
 * Anweisung nannte einen Befehl, den es auf der Maschine des Kollegen nicht
 * gibt, und damit war die Transkription dort faktisch unerreichbar.
 *
 * Was hier NICHT versprochen wird: dass Python vorhanden ist. Das Einrichten
 * sucht einen Interpreter ab 3.11 und sagt, wenn keiner da ist — Python zu
 * installieren ist ein Eingriff ins System und gehört nicht in ein Programm,
 * das man in einen Ordner kopiert.
 */

export function PythonSetup({ ready }: { ready: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const starten = (cpu: boolean) => {
    setResult(null);
    startTransition(async () => {
      setResult(await setupPythonAction({ cpu }));
    });
  };

  if (ready) {
    return (
      <p className="text-sm text-schrift-2">
        Eingerichtet — Beiträge lassen sich transkribieren und Text aus
        PDF-Anhängen lesen.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-schrift-2">
        Ohne sie wird nicht transkribiert und kein Text aus Anhängen gelesen.
        Alles andere — Ansehen, Suchen, Importieren, Kapitel — läuft auch ohne.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primaer"
          size="klein"
          disabled={pending}
          onClick={() => starten(false)}
        >
          <PackagePlus aria-hidden className="size-3.5" />
          {pending ? "Wird angestellt …" : "Jetzt einrichten"}
        </Button>
        <Button
          size="klein"
          variant="sekundaer"
          disabled={pending}
          onClick={() => starten(true)}
        >
          Ohne Grafikkarte
        </Button>
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

      <div className="space-y-1 border-t border-rand pt-3 text-xs text-schrift-2">
        <p>
          <strong className="font-medium">
            Vorausgesetzt wird Python ab 3.11
          </strong>{" "}
          auf dieser Maschine — von{" "}
          <code className="rounded bg-grund-3 px-1">python.org</code> oder aus
          dem Microsoft Store. Fehlt es, sagt der Auftrag das und richtet nichts
          ein.
        </p>
        <p>
          Geladen werden dabei einige hundert Megabyte (faster-whisper,
          ctranslate2, cuBLAS). Das dauert beim ersten Mal Minuten; der
          Fortschritt steht im Verlauf und lässt sich dort auch
          abbrechen.
        </p>
        <p>
          „Ohne Grafikkarte“ ist die kleinere Fassung für Maschinen ohne
          NVIDIA-Karte — sie transkribiert auf dem Prozessor, deutlich
          langsamer.
        </p>
      </div>
    </div>
  );
}
