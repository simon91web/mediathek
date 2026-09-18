"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import {
  reloadLibraryAction,
  reprobeToolsAction,
  setAuthorModeAction,
  setAutoJobsAction,
  setFfmpegDirAction,
} from "@/app/einstellungen/actions";
import type { ActionResult } from "@/app/einstellungen/actions";
import { Button, Card, SectionTitle } from "@/components/ui/basis";
import { cn } from "@/lib/utils";

/*
 * Die Bedienelemente der Einstellungen — einzeln, nicht als ein Block.
 *
 * Vorher stand alles in einer Karte: Neu einlesen, Autorenmodus, Automatik
 * und ffmpeg. Das war eine Liste ohne Ordnung, in der man den Autorenmodus
 * zwischen zwei Pfadfeldern suchen musste. Jetzt liegt jedes Stück auf der
 * Seite, zu der es gehört.
 */

/** Gemeinsames Gerüst: Knopf drücken, Ergebnis darunter anzeigen. */
function useAction() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (action: () => Promise<ActionResult>) => {
    startTransition(async () => {
      setResult(await action());
    });
  };

  const meldung = result ? (
    <p
      role="status"
      className={cn(
        "text-sm",
        result.ok ? "text-akzent" : "text-warnung",
      )}
    >
      {result.ok ? result.message : result.error}
    </p>
  ) : null;

  return { pending, run, meldung };
}

/** Neu einlesen — gehört zur Bibliothek. */
export function ReloadControl() {
  const { pending, run, meldung } = useAction();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primaer"
          disabled={pending}
          onClick={() => run(reloadLibraryAction)}
        >
          <RefreshCw
            aria-hidden
            className={cn("size-4", pending && "animate-spin")}
          />
          Neu einlesen
        </Button>
        <p className="text-xs text-schrift-2">
          Liest alle Beiträge neu, ohne den Index zu befragen. Nötig, wenn eine
          Datei geändert wurde, ohne dass sich Größe und Zeitstempel geändert
          haben.
        </p>
      </div>
      {meldung}
    </div>
  );
}

/** Autorenmodus — gehört zum Programm, nicht zur Bibliothek. */
export function AuthorModeControl({
  authorMode,
  readonly,
}: {
  authorMode: boolean;
  readonly: boolean;
}) {
  const { pending, run, meldung } = useAction();

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={authorMode}
          disabled={pending || readonly}
          onChange={(event) => run(() => setAuthorModeAction(event.target.checked))}
          className="mt-0.5 accent-akzent"
        />
        <span>
          <span className="text-sm font-medium">Autorenmodus</span>
          <span className="mt-0.5 block text-xs text-schrift-2">
            {readonly
              ? "Diese Mediathek ist zum Ansehen eingerichtet — der " +
                "Autorenmodus ist hier abgeschaltet und lässt sich nicht " +
                "einschalten."
              : "Erlaubt Bearbeiten, Anlegen und Importieren. Die Einstellung " +
                "gilt nur auf dieser Maschine, nie in der Bibliothek."}
          </span>
        </span>
      </label>
      {meldung}
    </div>
  );
}

/** Automatik nach dem Import — gehört zur Verarbeitung. */
export function AutoJobsControl({
  autoJobs,
  authorMode,
}: {
  autoJobs: boolean;
  authorMode: boolean;
}) {
  const { pending, run, meldung } = useAction();

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={autoJobs}
          disabled={pending || !authorMode}
          onChange={(event) => run(() => setAutoJobsAction(event.target.checked))}
          className="mt-0.5 accent-akzent"
        />
        <span>
          <span className="text-sm font-medium">
            Nach dem Import von selbst weiterarbeiten
          </span>
          <span className="mt-0.5 block text-xs text-schrift-2">
            Erzeugt Kachelbild, liest Anhänge und transkribiert, ohne dass man
            jeden Beitrag einzeln anklickt. Es läuft immer nur eines; der
            Fortschritt steht im Verlauf. Vorhandenes wird nie
            überschrieben.
          </span>
        </span>
      </label>
      {meldung}
    </div>
  );
}

/** ffmpeg-Verzeichnis — gehört zur Verarbeitung. */
export function FfmpegControl({ ffmpegDir }: { ffmpegDir: string | null }) {
  const { pending, run, meldung } = useAction();
  const [dir, setDir] = useState(ffmpegDir ?? "");

  return (
    <div className="space-y-2">
      <label htmlFor="ffmpeg-dir" className="block text-sm font-medium">
        ffmpeg-Verzeichnis
      </label>
      <p className="text-xs text-schrift-2">
        Das <em>Verzeichnis</em>, in dem ffmpeg.exe und ffprobe.exe liegen —
        nicht die Datei selbst. Der übliche Windows-Build ist ein shared build,
        bei dem daneben sieben DLLs liegen; eine einzeln kopierte ffmpeg.exe
        startet nicht.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          id="ffmpeg-dir"
          type="text"
          value={dir}
          onChange={(event) => setDir(event.target.value)}
          placeholder="C:\ffmpeg-master-latest-win64-gpl-shared\bin"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-rand bg-grund px-3 py-2 font-mono text-xs"
        />
        <Button disabled={pending} onClick={() => run(() => setFfmpegDirAction(dir))}>
          Übernehmen
        </Button>
        <Button disabled={pending} onClick={() => run(reprobeToolsAction)}>
          Neu suchen
        </Button>
      </div>
      {meldung}
    </div>
  );
}

/** Eine Karte mit Überschrift — damit die Seiten gleich aussehen. */
export function SettingsSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <SectionTitle hint={hint}>{title}</SectionTitle>
      <Card className="space-y-4">{children}</Card>
    </section>
  );
}
