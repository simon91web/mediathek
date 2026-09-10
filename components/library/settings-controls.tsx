"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import {
  reloadLibraryAction,
  reprobeToolsAction,
  setAuthorModeAction,
  setFfmpegDirAction,
} from "@/app/einstellungen/actions";
import type { ActionResult } from "@/app/einstellungen/actions";
import { Button, Card, SectionTitle } from "@/components/ui/basis";
import { cn } from "@/lib/utils";

/** Die Bedienelemente der Einstellungsseite; alles Schreibende als Server Action. */
export function SettingsControls({
  authorMode,
  readonly,
  ffmpegDir,
}: {
  authorMode: boolean;
  readonly: boolean;
  ffmpegDir: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [dir, setDir] = useState(ffmpegDir ?? "");

  const run = (action: () => Promise<ActionResult>) => {
    startTransition(async () => {
      setResult(await action());
    });
  };

  return (
    <section>
      <SectionTitle>Bedienung</SectionTitle>
      <Card className="space-y-4">
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
            Liest alle Beiträge neu, ohne den Index zu befragen. Nötig, wenn
            eine Datei geändert wurde, ohne dass sich Größe und Zeitstempel
            geändert haben.
          </p>
        </div>

        <div className="border-t border-rand pt-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={authorMode}
              disabled={pending || readonly}
              onChange={(event) =>
                run(() => setAuthorModeAction(event.target.checked))
              }
              className="mt-0.5 accent-akzent"
            />
            <span>
              <span className="text-sm font-medium">Autorenmodus</span>
              <span className="mt-0.5 block text-xs text-schrift-2">
                {readonly
                  ? "Diese Mediathek ist zum Ansehen eingerichtet — der " +
                    "Autorenmodus ist hier abgeschaltet und lässt sich nicht " +
                    "einschalten."
                  : "Erlaubt Bearbeiten, Anlegen und Importieren. Die " +
                    "Einstellung gilt nur auf dieser Maschine, nie in der " +
                    "Bibliothek."}
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-2 border-t border-rand pt-4">
          <label
            htmlFor="ffmpeg-dir"
            className="block text-sm font-medium"
          >
            ffmpeg-Verzeichnis
          </label>
          <p className="text-xs text-schrift-2">
            Das <em>Verzeichnis</em>, in dem ffmpeg.exe und ffprobe.exe liegen
            — nicht die Datei selbst. Der übliche Windows-Build ist ein
            shared build, bei dem daneben sieben DLLs liegen; eine einzeln
            kopierte ffmpeg.exe startet nicht.
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
            <Button
              disabled={pending}
              onClick={() => run(() => setFfmpegDirAction(dir))}
            >
              Übernehmen
            </Button>
            <Button disabled={pending} onClick={() => run(reprobeToolsAction)}>
              Neu suchen
            </Button>
          </div>
        </div>

        {result ? (
          <p
            role="status"
            className={cn(
              "border-t border-rand pt-3 text-sm",
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
