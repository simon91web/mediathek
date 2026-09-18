"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  FolderOpen,
  ScanSearch,
  Upload,
} from "lucide-react";

import {
  importScreenedAction,
  pickScreeningFolderAction,
  previewScreeningAction,
  screeningResultAction,
} from "@/app/sichten/actions";
import { cancelJobAction } from "@/app/medien/[slug]/actions";
import { useJobs } from "@/components/jobs/use-jobs";
import { Button } from "@/components/ui/basis";
import { formatTimecode } from "@/lib/library/chapters";
import { mergeWithJobs } from "@/lib/screening/merge";
import type { ScreeningCandidate } from "@/lib/screening/types";
import { ScreeningList } from "./screening-list";

/*
 * Die Sichtung, in einem Bauteil: Eingabe und Ergebnis sind zwei Ansichten
 * derselben Seite, kein zusammengesetztes Formular wie beim Import — hier
 * gibt es nichts, was für sich allein wiederverwendet würde.
 */
export function ScreeningPanel() {
  const [pfad, setPfad] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ScreeningCandidate[] | null>(
    null,
  );
  const { jobs } = useJobs();
  const live = useMemo(
    () => (candidates ? mergeWithJobs(candidates, jobs) : null),
    [candidates, jobs],
  );

  /*
   * Das Urteil steht nicht im Job (der bleibt allgemein) — sobald eine Zeile
   * "fertig" ist, aber noch kein Urteil hat, wird es einmalig nachgeholt.
   * `angefordert` verhindert doppelte Abfragen, während die Antwort noch
   * unterwegs ist.
   */
  const angefordert = useRef(new Set<string>());
  useEffect(() => {
    if (!live) return;
    for (const candidate of live) {
      if (candidate.state !== "fertig" || candidate.verdict !== null) continue;
      if (angefordert.current.has(candidate.sourcePath)) continue;
      angefordert.current.add(candidate.sourcePath);

      void screeningResultAction(candidate.sourcePath).then((result) => {
        if (!result) return;
        setCandidates((current) =>
          current?.map((entry) =>
            entry.sourcePath === candidate.sourcePath
              ? {
                  ...entry,
                  verdict: result.verdict,
                  summary: result.summary,
                  matches: result.matches,
                  durationSec: result.durationSec ?? entry.durationSec,
                }
              : entry,
          ) ?? current,
        );
      });
    }
  }, [live]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importPending, startImport] = useTransition();
  const [importNote, setImportNote] = useState<string | null>(null);

  /*
   * Vorauswahl, einmalig: sobald eine Zeile ihr Urteil bekommt, wird "Neu"
   * automatisch angehakt — Ähnliches oder Vorhandenes nicht. Danach bleibt
   * jede eigene Änderung stehen, auch wenn die Zeile sich sonst nicht mehr
   * ändert.
   */
  const vorausgewaehlt = useRef(new Set<string>());
  useEffect(() => {
    if (!live) return;
    for (const candidate of live) {
      if (candidate.verdict !== "neu") continue;
      if (vorausgewaehlt.current.has(candidate.sourcePath)) continue;
      vorausgewaehlt.current.add(candidate.sourcePath);
      setSelected((current) => new Set(current).add(candidate.sourcePath));
    }
  }, [live]);

  const toggleSelect = (sourcePath: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(sourcePath)) next.delete(sourcePath);
      else next.add(sourcePath);
      return next;
    });
  };

  const discard = (candidate: ScreeningCandidate) => {
    if (candidate.jobId) void cancelJobAction(candidate.jobId);
    setCandidates(
      (current) =>
        current?.filter((entry) => entry.sourcePath !== candidate.sourcePath) ??
        current,
    );
    setSelected((current) => {
      if (!current.has(candidate.sourcePath)) return current;
      const next = new Set(current);
      next.delete(candidate.sourcePath);
      return next;
    });
  };

  const importSelected = () => {
    const paths = [...selected];
    if (paths.length === 0 || !live) return;
    setImportNote(null);
    startImport(async () => {
      const result = await importScreenedAction(paths);
      setImportNote(
        result.ok
          ? `${result.imported.length} ${result.imported.length === 1 ? "Beitrag" : "Beiträge"} importiert.`
          : (result.error ?? result.lines.join(" ") ?? "Fehlgeschlagen."),
      );
      if (result.imported.length > 0) {
        const importedSet = new Set(paths);
        setCandidates(
          (current) =>
            current?.filter((entry) => !importedSet.has(entry.sourcePath)) ??
            current,
        );
        setSelected(new Set());
      }
    });
  };

  const selectedDurationSec = live
    ? live
        .filter((candidate) => selected.has(candidate.sourcePath))
        .reduce((sum, candidate) => sum + (candidate.durationSec ?? 0), 0)
    : 0;

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await previewScreeningAction(pfad);
      if (result.ok) {
        setCandidates(result.candidates);
      } else {
        setError(result.error);
      }
    });
  };

  const [pickPending, startPick] = useTransition();

  const durchsuchen = () => {
    setError(null);
    startPick(async () => {
      const gewaehlt = await pickScreeningFolderAction();
      if (gewaehlt.ok) {
        setPfad(gewaehlt.dir);
        return;
      }
      if (!gewaehlt.canceled) {
        setError(gewaehlt.error ?? "Der Dialog ging nicht.");
      }
    });
  };

  if (live) {
    return (
      <div className="space-y-6 pb-20">
        <div className="flex items-center gap-2">
          <Button
            variant="leise"
            size="klein"
            onClick={() => {
              setCandidates(null);
              setError(null);
              setSelected(new Set());
              setImportNote(null);
            }}
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Neuer Pfad
          </Button>
          <span className="text-schrift-3">·</span>
          <code className="font-mono text-xs text-schrift-2">{pfad}</code>
        </div>

        {live.length === 0 ? (
          <p className="text-sm text-schrift-2">
            Nichts mehr übrig — alles importiert oder verworfen.
          </p>
        ) : (
          <ScreeningList
            candidates={live}
            selected={selected}
            onToggleSelect={toggleSelect}
            onDiscard={discard}
          />
        )}

        {importNote ? (
          <p className="text-sm text-akzent">{importNote}</p>
        ) : null}

        {selected.size > 0 ? (
          <div className="sticky bottom-4 z-10 flex justify-center">
            <div className="flex items-center gap-3 rounded-xl border border-rand bg-grund/95 p-3 shadow-lg backdrop-blur">
              <span className="text-sm font-medium">
                {selected.size} ausgewählt
              </span>
              {selectedDurationSec > 0 ? (
                <span className="text-xs text-schrift-2">
                  · zusammen {formatTimecode(selectedDurationSec)}
                </span>
              ) : null}
              <Button
                variant="leise"
                size="klein"
                onClick={() => setSelected(new Set())}
              >
                Auswahl aufheben
              </Button>
              <Button
                variant="primaer"
                disabled={importPending}
                onClick={importSelected}
              >
                <Upload aria-hidden className="size-4" />
                {importPending
                  ? "Importiert …"
                  : `${selected.size} importieren`}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="rounded-xl border border-rand bg-grund-2 p-5">
        <label
          htmlFor="sichtung-pfad"
          className="mb-1.5 block text-sm font-medium"
        >
          Datei- oder Ordnerpfad
        </label>
        <p className="mb-3 text-xs text-schrift-2">
          Ein Ordner, oder über das Feld auch eine einzelne Datei — bis zu
          drei Ebenen tief werden Video-, Audio- und Markdown-Dateien
          gefunden, wie beim Import.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="sekundaer"
            disabled={pickPending}
            onClick={durchsuchen}
          >
            <FolderOpen aria-hidden className="size-4" />
            {pickPending ? "Wählt …" : "Ordner wählen"}
          </Button>
          <input
            id="sichtung-pfad"
            type="text"
            value={pfad}
            onChange={(event) => setPfad(event.target.value)}
            placeholder="C:\Users\Simon\Videos\Captures oder eine einzelne Datei"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-rand bg-grund px-3 py-2 font-mono text-xs"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !pending && pfad.trim()) run();
            }}
          />
          <Button
            variant="primaer"
            disabled={pending || !pfad.trim()}
            onClick={run}
          >
            <ScanSearch aria-hidden className="size-4" />
            {pending ? "Sichtet …" : "Sichten"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="flex items-start gap-2 text-sm text-warnung">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-schrift-2 uppercase">
          Wie das funktioniert
        </h2>
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-rand bg-grund p-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <p className="text-sm">
              <strong>Erkennen.</strong>
            </p>
            <p className="text-xs text-schrift-2">
              Titel und Art aus dem Dateinamen, wie beim Import — noch ohne
              etwas anzulegen.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm">
              <strong>Kurztranskript.</strong>
            </p>
            <p className="text-xs text-schrift-2">
              Derselbe Whisper-Lauf wie sonst auch, nur in ein
              Scratch-Verzeichnis statt in die Bibliothek.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm">
              <strong>Abgleich.</strong>
            </p>
            <p className="text-xs text-schrift-2">
              Suchindex für schnelle Kandidaten, KI-Assistent für die
              Einschätzung.
            </p>
          </div>
        </div>
      </div>

      <p className="rounded-lg border border-rand bg-grund-2 px-3 py-2.5 text-xs text-schrift-2">
        Nichts landet in der Bibliothek, bevor du es unten bestätigst — die
        Sichtung ist reines Vorher-Ansehen.
      </p>
    </div>
  );
}
