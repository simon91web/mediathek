"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FolderOpen, FolderPlus } from "lucide-react";

import {
  createLibraryAction,
  pickFolderAction,
  previewLibraryAction,
  openExistingLibraryAction,
} from "@/app/start/actions";
import type { PreviewResult } from "@/app/start/actions";
import { setLibraryDirAction } from "@/app/einstellungen/actions";
import { Button } from "@/components/ui/basis";
import { cn } from "@/lib/utils";

/*
 * Öffnen oder anlegen — dieselbe Wahl wie beim Begrüßungsschirm, später
 * jederzeit unter Einstellungen. Den Ordner zu wechseln ist kein Schreiben
 * in die Bibliothek: es wechselt nur, WELCHEN Ordner die Mediathek zeigt.
 */

type Weg = "waehlen" | "anlegen";

export function LibraryChooser({
  pathExample,
  suggestedParent,
  suggestedName,
  current,
  allowEmptyReset = false,
}: {
  pathExample: string;
  suggestedParent: string;
  suggestedName: string;
  /** Aktueller Ordner — in den Einstellungen vorausgefüllt. */
  current?: string;
  /** Leeres Feld stellt auf den Standard zurück (nur Einstellungen). */
  allowEmptyReset?: boolean;
}) {
  const router = useRouter();
  const [weg, setWeg] = useState<Weg>("waehlen");
  const [parent, setParent] = useState(suggestedParent);
  const [name, setName] = useState(suggestedName);
  const [bestehend, setBestehend] = useState(current ?? "");
  const [vorschau, setVorschau] = useState<PreviewResult | null>(null);
  const [elternNehmen, setElternNehmen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (weg !== "anlegen" || !parent.trim()) {
        setVorschau(null);
        return;
      }
      void previewLibraryAction({ parent, name }).then(setVorschau);
    }, 200);
    return () => clearTimeout(timer);
  }, [weg, parent, name]);

  const verzeichnisSetzen = (wert: string) => {
    setParent(wert);
    setElternNehmen(false);
  };

  const waehlen = () => {
    setFehler(null);
    setHinweis(null);
    startTransition(async () => {
      const result = await pickFolderAction();
      if (result.ok) {
        verzeichnisSetzen(result.dir);
        return;
      }
      if (!result.canceled) setFehler(result.error ?? "Der Dialog ging nicht.");
    });
  };

  const ziel =
    elternNehmen && parent.trim() ? parent.trim() : (vorschau?.target ?? null);

  const anlegen = () => {
    setFehler(null);
    setHinweis(null);
    startTransition(async () => {
      const result = await createLibraryAction({
        parent,
        name,
        useParent: elternNehmen,
      });
      if (result.ok) {
        router.refresh();
        return;
      }
      setFehler(result.error);
    });
  };

  const bestehendenDurchsuchen = () => {
    setFehler(null);
    setHinweis(null);
    startTransition(async () => {
      const gewaehlt = await pickFolderAction();
      if (gewaehlt.ok) {
        setBestehend(gewaehlt.dir);
        return;
      }
      if (!gewaehlt.canceled) {
        setFehler(gewaehlt.error ?? "Der Dialog ging nicht.");
      }
    });
  };

  const bestehendenOeffnen = () => {
    setFehler(null);
    setHinweis(null);
    startTransition(async () => {
      if (allowEmptyReset) {
        const result = await setLibraryDirAction(bestehend);
        if (result.ok) {
          setHinweis(result.message);
          router.refresh();
          return;
        }
        setFehler(result.error);
        return;
      }
      const result = await openExistingLibraryAction(bestehend);
      if (result.ok) {
        router.refresh();
        return;
      }
      setFehler(result.error);
    });
  };

  const oeffnenDisabled = allowEmptyReset
    ? pending || bestehend.trim() === (current ?? "")
    : pending || !bestehend.trim();

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(
          [
            ["waehlen", "Bestehende öffnen", FolderOpen],
            ["anlegen", "Neue Bibliothek anlegen", FolderPlus],
          ] as const
        ).map(([wert, beschriftung, Icon]) => (
          <button
            key={wert}
            type="button"
            onClick={() => {
              setWeg(wert);
              setFehler(null);
              setHinweis(null);
            }}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors",
              weg === wert
                ? "border-akzent bg-akzent/10 font-medium text-akzent"
                : "border-rand bg-grund-2 text-schrift-2 hover:bg-grund-3",
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            {beschriftung}
          </button>
        ))}
      </div>

      {weg === "anlegen" ? (
        <div className="space-y-4 rounded-xl border border-rand bg-grund-2 p-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              1. Verzeichnis
              <span className="ml-2 font-normal text-schrift-3">
                darin wird angelegt
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={parent}
                spellCheck={false}
                disabled={pending}
                placeholder={suggestedParent || pathExample}
                onChange={(event) => verzeichnisSetzen(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-rand bg-grund px-3 font-mono text-xs"
              />
              <Button size="klein" disabled={pending} onClick={waehlen}>
                <FolderOpen aria-hidden className="size-3.5" />
                Durchsuchen
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="bibliotheks-name" className="block text-sm font-medium">
              2. Name
              <span className="ml-2 font-normal text-schrift-3">
                so heißt der Ordner
              </span>
            </label>
            <input
              id="bibliotheks-name"
              type="text"
              value={name}
              spellCheck={false}
              disabled={pending || elternNehmen}
              placeholder="Mediathek"
              onChange={(event) => setName(event.target.value)}
              className="h-10 w-full rounded-lg border border-rand bg-grund px-3 text-sm disabled:opacity-50"
            />
          </div>

          <div className="rounded-lg border border-rand bg-grund px-3 py-2">
            <p className="text-xs text-schrift-3">Es entsteht</p>
            <p className="mt-0.5 font-mono text-sm break-all">{ziel ?? "…"}</p>
            {vorschau?.error ? (
              <p className="mt-1 text-xs text-warnung">{vorschau.error}</p>
            ) : null}
            {!elternNehmen && vorschau?.targetIsLibrary ? (
              <p className="mt-1 text-xs text-schrift-2">
                Diesen Ordner gibt es schon und er enthält bereits eine
                Bibliothek — sie wird geöffnet, nichts überschrieben.
              </p>
            ) : null}
          </div>

          {vorschau?.suggestParent ? (
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors",
                elternNehmen
                  ? "border-akzent bg-akzent/10"
                  : "border-akzent/40 bg-akzent/5",
              )}
            >
              <input
                type="checkbox"
                checked={elternNehmen}
                disabled={pending}
                onChange={(event) => setElternNehmen(event.target.checked)}
                className="mt-0.5 accent-akzent"
              />
              <span className="text-sm">
                <span className="font-medium">
                  Der gewählte Ordner heißt schon „{name.trim()}“.
                </span>
                <span className="mt-0.5 block text-xs text-schrift-2">
                  Wahrscheinlich ist er selbst gemeint. Sonst entstünde darin
                  ein zweiter gleichen Namens.
                  {vorschau.parentIsLibrary
                    ? " Er enthält bereits eine Bibliothek."
                    : ""}
                </span>
              </span>
            </label>
          ) : null}

          <Button
            variant="primaer"
            disabled={pending || !ziel || Boolean(vorschau?.error)}
            onClick={anlegen}
          >
            {pending ? (
              "Einen Moment …"
            ) : (
              <>
                <Check aria-hidden className="size-4" />
                Hier anlegen und öffnen
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-rand bg-grund-2 p-4">
          <p className="text-sm text-schrift-2">
            Für einen Ordner, den es schon gibt — etwa auf dem Netzlaufwerk.
            Er wird nur gelesen und um das ergänzt, was fehlt; nichts darin
            wird überschrieben.
          </p>
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="bestehend-pfad">
              Ordner
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="bestehend-pfad"
                type="text"
                value={bestehend}
                spellCheck={false}
                disabled={pending}
                placeholder={pathExample}
                aria-label="Bibliotheksordner"
                onChange={(event) => setBestehend(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") bestehendenOeffnen();
                }}
                className="h-10 min-w-0 flex-1 rounded-lg border border-rand bg-grund px-3 font-mono text-xs"
              />
              <Button
                size="klein"
                disabled={pending}
                onClick={bestehendenDurchsuchen}
              >
                <FolderOpen aria-hidden className="size-3.5" />
                Durchsuchen
              </Button>
            </div>
            {bestehend.trim() ? (
              <div className="rounded-lg border border-rand bg-grund px-3 py-2">
                <p className="text-xs text-schrift-3">Es wird geöffnet</p>
                <p className="mt-0.5 font-mono text-sm break-all">
                  {bestehend.trim()}
                </p>
              </div>
            ) : null}
            <p className="text-xs text-schrift-2">
              Kommt der Ordner-Dialog bei einem Netzlaufwerk oder WebDAV nicht
              tiefer als der erste Ordner, den vollständigen Pfad hier einfügen
              — auf dem Mac oft unter /Volumes/…, unter Windows als UNC-Pfad.
              {allowEmptyReset
                ? " Feld leeren und übernehmen stellt auf den Standard zurück."
                : ""}
            </p>
          </div>
          <Button
            variant="primaer"
            disabled={oeffnenDisabled}
            onClick={bestehendenOeffnen}
          >
            {pending ? (
              "Einen Moment …"
            ) : (
              <>
                <Check aria-hidden className="size-4" />
                {allowEmptyReset && !bestehend.trim()
                  ? "Standard verwenden"
                  : "Diesen Ordner öffnen"}
              </>
            )}
          </Button>
        </div>
      )}

      {fehler ? (
        <p className="rounded-lg border border-warnung/40 bg-warnung-grund px-3 py-2 text-sm text-warnung">
          {fehler}
        </p>
      ) : null}
      {hinweis ? (
        <p className="rounded-lg border border-akzent/30 bg-akzent/5 px-3 py-2 text-sm text-akzent">
          {hinweis}
        </p>
      ) : null}
    </div>
  );
}
