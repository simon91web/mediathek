"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FolderOpen,
  FolderPlus,
  Library,
} from "lucide-react";

import {
  createLibraryAction,
  pickFolderAction,
  previewLibraryAction,
  openExistingLibraryAction,
} from "@/app/start/actions";
import type { PreviewResult } from "@/app/start/actions";
import { Button } from "@/components/ui/basis";
import { cn } from "@/lib/utils";

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
 */

type Weg = "waehlen" | "anlegen";

export function Willkommen({
  lostDir,
  suggestedParent,
  suggestedName,
}: {
  /** Ein gemerkter Ordner, der nicht mehr erreichbar ist. */
  lostDir: string | null;
  suggestedParent: string;
  suggestedName: string;
}) {
  const router = useRouter();
  const [weg, setWeg] = useState<Weg>("anlegen");
  const [parent, setParent] = useState(suggestedParent);
  const [name, setName] = useState(suggestedName);
  const [vorschau, setVorschau] = useState<PreviewResult | null>(null);
  const [elternNehmen, setElternNehmen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /*
   * Die Vorschau kommt vom Server: nur der weiß, ob es den Ordner schon gibt.
   * Entprellt, weil sie bei jedem Tastendruck fällig wäre.
   */
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

  /*
   * Ein anderes Verzeichnis hebt die vorige Entscheidung auf. Bewusst hier
   * und nicht in einem Effect: der Lint verbietet setState im Effect zu
   * Recht — es ist eine Folge des Klicks, kein Zustand, der sich ableitet.
   */
  const verzeichnisSetzen = (wert: string) => {
    setParent(wert);
    setElternNehmen(false);
  };

  const waehlen = () => {
    setFehler(null);
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

  const bestehenden = () => {
    setFehler(null);
    startTransition(async () => {
      const gewaehlt = await pickFolderAction();
      if (!gewaehlt.ok) {
        if (!gewaehlt.canceled) {
          setFehler(gewaehlt.error ?? "Der Dialog ging nicht.");
        }
        return;
      }
      const result = await openExistingLibraryAction(gewaehlt.dir);
      if (result.ok) {
        router.refresh();
        return;
      }
      setFehler(result.error);
    });
  };

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

      <div className="flex gap-2">
        {(
          [
            ["anlegen", "Neue Bibliothek anlegen", FolderPlus],
            ["waehlen", "Bestehende öffnen", FolderOpen],
          ] as const
        ).map(([wert, beschriftung, Icon]) => (
          <button
            key={wert}
            type="button"
            onClick={() => {
              setWeg(wert);
              setFehler(null);
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
                placeholder="C:\Users\…\Documents"
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

          {/*
           * Der wichtigste Teil dieses Schirms: was gleich entsteht, steht
           * da — vollständig, bevor geklickt wird.
           */}
          <div className="rounded-lg border border-rand bg-grund px-3 py-2">
            <p className="text-xs text-schrift-3">Es entsteht</p>
            <p className="mt-0.5 font-mono text-sm break-all">
              {ziel ?? "…"}
            </p>
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

          {/*
           * „D:\Mediathek" gewählt und „Mediathek" getippt: gemeint ist fast
           * immer der gewählte Ordner selbst, nicht einer gleichen Namens
           * darin. Vorgeschlagen, nicht entschieden.
           */}
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
                Hier anlegen und loslegen
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-rand bg-grund-2 p-4">
          <p className="text-sm text-schrift-2">
            Für einen Ordner, den es schon gibt — etwa den einer Kollegin auf
            dem Netzlaufwerk. Er wird nur gelesen und um das ergänzt, was
            fehlt; nichts darin wird überschrieben.
          </p>
          <Button variant="primaer" disabled={pending} onClick={bestehenden}>
            <FolderOpen aria-hidden className="size-4" />
            {pending ? "Einen Moment …" : "Ordner wählen"}
          </Button>
        </div>
      )}

      {fehler ? (
        <p className="rounded-lg border border-warnung/40 bg-warnung-grund px-3 py-2 text-sm text-warnung">
          {fehler}
        </p>
      ) : null}

      <p className="flex items-center gap-1.5 text-xs text-schrift-3">
        <ArrowRight aria-hidden className="size-3" />
        Später umstellen geht jederzeit unter Einstellungen.
      </p>
    </div>
  );
}
