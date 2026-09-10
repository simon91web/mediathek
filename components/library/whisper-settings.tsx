"use client";

import { useState, useTransition } from "react";

import { setWhisperAction } from "@/app/einstellungen/actions";
import type { ActionResult } from "@/app/einstellungen/actions";
import { Button, Card, SectionTitle } from "@/components/ui/basis";
import { cn } from "@/lib/utils";

/*
 * Modell und Sprache für die Transkription.
 *
 * Die Beschreibungen nennen nachgemessene Werte statt Marketingworte: wer
 * hier wählt, soll wissen, was es kostet.
 */

const MODELS: Array<{ value: string; label: string; hint: string }> = [
  {
    value: "large-v3-turbo",
    label: "large-v3-turbo",
    hint:
      "Der Standard. Auf einer RTX 4070 etwa fünfundzwanzigmal schneller als " +
      "Echtzeit — ein 90-Minuten-Beitrag in knapp vier Minuten. Braucht rund " +
      "zwei Gigabyte Grafikspeicher.",
  },
  {
    value: "large-v3",
    label: "large-v3",
    hint:
      "Etwas genauer bei schwieriger Aufnahme, aber vier- bis achtmal " +
      "langsamer und mit drei Gigabyte Grafikspeicher. Bei nah " +
      "mikrofoniertem Vortragston lohnt sich das selten.",
  },
  {
    value: "small",
    label: "small",
    hint:
      "Für Maschinen ohne NVIDIA-Karte. Auf der CPU etwa sechs bis zehn " +
      "Minuten je Stunde Aufnahme; deutlich schwächer im Deutschen.",
  },
];

export function WhisperSettings({
  model,
  language,
  gpuReady,
}: {
  model: string;
  language: string;
  gpuReady: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState(model);
  const [lang, setLang] = useState(language);
  const [result, setResult] = useState<ActionResult | null>(null);

  const save = () => {
    startTransition(async () => {
      setResult(await setWhisperAction({ model: chosen, language: lang }));
    });
  };

  const dirty = chosen !== model || lang !== language;

  return (
    <section>
      <SectionTitle>Transkription</SectionTitle>
      <Card className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Modell</legend>
          <div className="space-y-2">
            {MODELS.map((entry) => (
              <label
                key={entry.value}
                className={cn(
                  "flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition-colors",
                  chosen === entry.value
                    ? "border-akzent bg-akzent/5"
                    : "border-rand hover:bg-grund-3",
                )}
              >
                <input
                  type="radio"
                  name="whisper-modell"
                  value={entry.value}
                  checked={chosen === entry.value}
                  onChange={() => setChosen(entry.value)}
                  className="mt-0.5 accent-akzent"
                />
                <span className="min-w-0">
                  <span className="block font-mono text-sm">{entry.label}</span>
                  <span className="mt-0.5 block text-xs text-schrift-2">
                    {entry.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {!gpuReady ? (
            <p className="text-xs text-warnung">
              Auf dieser Maschine wurde keine nutzbare NVIDIA-Karte gefunden.
              Die großen Modelle wären auf der CPU etwa Echtzeit — für längere
              Beiträge unbrauchbar.
            </p>
          ) : null}
        </fieldset>

        <div className="space-y-1.5 border-t border-rand pt-4">
          <label htmlFor="whisper-sprache" className="block text-sm font-medium">
            Sprache
          </label>
          <p className="text-xs text-schrift-2">
            Zwei Buchstaben, etwa <code className="rounded bg-grund-3 px-1">de</code>
            . Leer lassen, um die Sprache erkennen zu lassen — das kostet
            Genauigkeit, wenn ohnehin immer deutsch gesprochen wird.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              id="whisper-sprache"
              type="text"
              value={lang}
              onChange={(event) => setLang(event.target.value)}
              placeholder="de"
              maxLength={8}
              className="w-24 rounded-lg border border-rand bg-grund px-3 py-2 font-mono text-sm"
            />
            <Button
              variant="primaer"
              disabled={pending || !dirty}
              onClick={save}
            >
              {pending ? "Speichert …" : "Übernehmen"}
            </Button>
          </div>
        </div>

        <p className="border-t border-rand pt-3 text-xs text-schrift-2">
          Fachbegriffe kommen aus dem Titel, den Schlagworten und der Datei{" "}
          <code className="rounded bg-grund-3 px-1">glossar.txt</code> in der
          Bibliothek. Das ist der billigste Genauigkeitsgewinn: ohne Glossar
          schreibt Whisper Fachwörter phonetisch —{" "}
          {"nachgemessen „Eliös 3“ statt „Elios 3“"} — und die daraus erzeugten
          Kapitel erben den Fehler.
        </p>

        {result ? (
          <p
            role="status"
            className={cn(
              "text-sm",
              result.ok ? "text-akzent" : "text-warnung",
            )}
          >
            {result.ok ? result.message : result.error}
          </p>
        ) : null}
      </Card>
    </section>
  );
}
