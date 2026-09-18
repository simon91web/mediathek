"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  FolderOpen,
  Pause,
  Play,
  ScanSearch,
  Upload,
} from "lucide-react";

import {
  importScreenedAction,
  pickScreeningFolderAction,
  previewScreeningAction,
  resumeScreeningAction,
  screeningResultAction,
} from "@/app/sichten/actions";
import { cancelJobAction } from "@/app/medien/[slug]/actions";
import { useJobs } from "@/components/jobs/use-jobs";
import { Button } from "@/components/ui/basis";
import { formatTimecode } from "@/lib/library/chapters";
import { mergeWithJobs } from "@/lib/screening/merge";
import {
  parseSession,
  readSessionRaw,
  writeSession,
} from "@/lib/screening/session-storage";
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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importPending, startImport] = useTransition();
  const [importNote, setImportNote] = useState<string | null>(null);
  const [verschieben, setVerschieben] = useState(false);
  const [confirmingMove, setConfirmingMove] = useState(false);

  /*
   * Verhindert doppelte Urteils-Abfragen, während eine schon unterwegs ist —
   * NICHT, um wiederhergestellte Zeilen zu schützen: der Effekt weiter unten
   * prüft dafür selbst `candidate.verdict !== null`, das reicht.
   */
  const angefordert = useRef(new Set<string>());

  /*
   * Eine gemerkte Sichtung wiederherstellen, damit ein Ordner-Scan überlebt,
   * wenn man währenddessen woanders auf der Plattform war — die Aufträge
   * laufen serverseitig ohnehin unabhängig von dieser Seite weiter.
   *
   * Kein setState in einem Effect: localStorage gibt es serverseitig nicht,
   * und ein Effect, der das nachträglich einliest, wäre genau das verbotene
   * Muster (siehe watch-progress-bar.tsx). Stattdessen useSyncExternalStore
   * für die ROHE, vergleichbare Zeichenkette — ein frisch geparstes Objekt
   * wäre bei jeder Runde "neu" und liefe in eine Endlosschleife — und das
   * Übernehmen ins eigene state passiert einmalig WÄHREND des Renderns
   * (React-eigenes Muster fürs Anpassen von State beim Rendern), sobald die
   * echte Zeichenkette da ist; `geladen` verhindert eine zweite Runde.
   */
  const rawSession = useSyncExternalStore(
    () => () => {},
    () => readSessionRaw(),
    () => null,
  );
  const restored = useMemo(() => parseSession(rawSession), [rawSession]);
  const [geladen, setGeladen] = useState(false);
  if (!geladen && restored && restored.candidates.length > 0) {
    setGeladen(true);
    setPfad(restored.pfad);
    setCandidates(restored.candidates);
    setSelected(new Set(restored.selected));
  }

  /*
   * Schreibt NUR eine echte Sitzung, löscht aber nie von selbst: solange
   * `candidates` null ist, kann das ebenso gut bedeuten "gerade erst
   * geladen, die Wiederherstellung war nur noch nicht an der Reihe" wie
   * "wirklich nichts da" — und React ruft Effekte in der Entwicklung
   * (Strict Mode) beim Einhängen absichtlich zweimal auf, wodurch ein
   * einmaliges Überspringen (per Ref) genau in diesem Fenster verpufft.
   * Das Löschen passiert deshalb gezielt bei "Neuer Pfad" und ist hier
   * bewusst nicht der Gegenfall.
   */
  useEffect(() => {
    if (!candidates) return;
    writeSession({ pfad, candidates, selected: [...selected] });
  }, [pfad, candidates, selected]);

  /*
   * Das Urteil steht nicht im Job (der bleibt allgemein) — sobald eine Zeile
   * "fertig" ist, aber noch kein Urteil hat, wird es einmalig nachgeholt.
   * `angefordert` verhindert doppelte Abfragen, während die Antwort noch
   * unterwegs ist. Ergibt sich "neu", wird die Zeile direkt hier — nicht in
   * einem separaten, dauerhaft mitlaufenden Effekt — einmalig vorausgewählt;
   * eine spätere eigene Abwahl hat dann nichts mehr, das sie rückgängig
   * machen könnte.
   */
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
        if (result.verdict === "neu") {
          setSelected((current) => new Set(current).add(candidate.sourcePath));
        }
      });
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

  /*
   * "Pausieren" ist clientseitig: die noch wartenden/laufenden Aufträge
   * werden abgebrochen (dieselbe Funktion wie beim Verwerfen), die Zeilen
   * bleiben aber stehen — mit einem eigenen Zustand statt "Fehler", damit
   * klar ist, dass hier nichts schiefgegangen ist, sondern angehalten wurde.
   */
  const pauseAll = () => {
    if (!live) return;
    for (const candidate of live) {
      if (candidate.jobId) void cancelJobAction(candidate.jobId);
    }
    setCandidates(
      (current) =>
        current?.map((entry) =>
          entry.jobId && (entry.state === "wartet" || entry.state === "laeuft")
            ? {
                ...entry,
                state: "pausiert",
                jobId: null,
                progress: 0,
                stageMessage: null,
                deviceUsed: null,
                speed: null,
              }
            : entry,
        ) ?? current,
    );
  };

  const [resumePending, startResume] = useTransition();

  const resumeAll = () => {
    if (!live) return;
    const paused = live.filter((candidate) => candidate.state === "pausiert");
    if (paused.length === 0) return;
    startResume(async () => {
      const result = await resumeScreeningAction(
        paused.map((candidate) => ({
          sourcePath: candidate.sourcePath,
          fileName: candidate.fileName,
          kind: candidate.kind,
          titleGuess: candidate.titleGuess,
          durationSec: candidate.durationSec,
        })),
      );
      setCandidates(
        (current) =>
          current?.map((entry) => {
            const outcome = result[entry.sourcePath];
            return outcome
              ? { ...entry, jobId: outcome.jobId, state: outcome.state }
              : entry;
          }) ?? current,
      );
    });
  };

  const importSelected = (move: boolean) => {
    const paths = [...selected];
    if (paths.length === 0 || !live) return;
    setImportNote(null);
    setConfirmingMove(false);
    startImport(async () => {
      const result = await importScreenedAction(paths, move);
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
        // Cache-Treffer können das Urteil "neu" schon beim Scan mitbringen.
        setSelected(
          new Set(
            result.candidates
              .filter((candidate) => candidate.verdict === "neu")
              .map((candidate) => candidate.sourcePath),
          ),
        );
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
    const hatAktive = live.some((candidate) => candidate.jobId !== null);
    const hatPausierte = live.some(
      (candidate) => candidate.state === "pausiert",
    );

    return (
      <div className="space-y-6 pb-20">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="leise"
            size="klein"
            onClick={() => {
              setCandidates(null);
              setError(null);
              setSelected(new Set());
              setImportNote(null);
              writeSession(null);
            }}
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Neuer Pfad
          </Button>
          <span className="text-schrift-3">·</span>
          <code className="font-mono text-xs text-schrift-2">{pfad}</code>

          {hatAktive ? (
            <Button
              variant="sekundaer"
              size="klein"
              className="ml-auto"
              onClick={pauseAll}
            >
              <Pause aria-hidden className="size-3.5" />
              Pausieren
            </Button>
          ) : hatPausierte ? (
            <Button
              variant="sekundaer"
              size="klein"
              className="ml-auto"
              disabled={resumePending}
              onClick={resumeAll}
            >
              <Play aria-hidden className="size-3.5" />
              {resumePending ? "Setzt fort …" : "Fortsetzen"}
            </Button>
          ) : null}
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
            <div className="flex flex-col gap-2 rounded-xl border border-rand bg-grund/95 p-3 shadow-lg backdrop-blur">
              {confirmingMove ? (
                <div className="flex items-start gap-2 rounded-lg border border-warnung/40 bg-warnung-grund p-2.5 text-sm text-warnung">
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Die {selected.size === 1 ? "Datei" : "Dateien"} werden aus
                    dem Quellordner <strong>entfernt</strong> und liegen
                    danach nur noch in der Bibliothek. Wirklich verschieben?
                  </span>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
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
                <label className="flex items-center gap-1.5 text-xs text-schrift-2">
                  <input
                    type="checkbox"
                    checked={verschieben}
                    onChange={(event) => {
                      setVerschieben(event.target.checked);
                      setConfirmingMove(false);
                    }}
                    className="accent-akzent"
                  />
                  Verschieben statt kopieren
                </label>
                {confirmingMove ? (
                  <span className="ml-auto flex gap-2">
                    <Button
                      size="klein"
                      onClick={() => setConfirmingMove(false)}
                    >
                      Abbrechen
                    </Button>
                    <Button
                      variant="primaer"
                      size="klein"
                      disabled={importPending}
                      onClick={() => importSelected(true)}
                    >
                      Ja, verschieben
                    </Button>
                  </span>
                ) : (
                  <Button
                    variant="primaer"
                    className="ml-auto"
                    disabled={importPending}
                    onClick={() =>
                      verschieben
                        ? setConfirmingMove(true)
                        : importSelected(false)
                    }
                  >
                    <Upload aria-hidden className="size-4" />
                    {importPending
                      ? "Importiert …"
                      : `${selected.size} importieren`}
                  </Button>
                )}
              </div>
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
        Läuft weiter, auch wenn du zwischendurch etwas anderes auf der
        Plattform machst — nichts landet aber in der Bibliothek, bevor du es
        unten bestätigst.
      </p>
    </div>
  );
}
