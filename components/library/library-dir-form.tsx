"use client";

import { useState, useTransition } from "react";
import { FolderOpen, Lock } from "lucide-react";

import { openLibraryFolderAction } from "@/app/einstellungen/actions";
import type { ActionResult } from "@/app/einstellungen/actions";
import { LibraryChooser } from "@/components/library/library-chooser";
import { Button } from "@/components/ui/basis";

/*
 * Der Bibliotheksordner — jederzeit umstellbar, solange nicht
 * MEDIATHEK_LIBRARY_DIR ihn festlegt. Autorenmodus ist dafür nicht nötig:
 * ein anderer Ordner ist eine andere Bibliothek zum Ansehen, kein Schreiben
 * in die aktuelle.
 */

export function LibraryDirForm({
  current,
  fixed,
  pathExample,
  suggestedParent,
  suggestedName,
}: {
  current: string;
  /** true, wenn MEDIATHEK_LIBRARY_DIR gesetzt ist — dann ist nichts wählbar. */
  fixed: boolean;
  pathExample: string;
  suggestedParent: string;
  suggestedName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const oeffnen = () => {
    startTransition(async () => {
      setResult(await openLibraryFolderAction());
    });
  };

  const OeffnenKnopf = (
    <Button size="klein" disabled={pending} onClick={oeffnen}>
      <FolderOpen aria-hidden className="size-3.5" />
      Im Dateimanager öffnen
    </Button>
  );

  if (fixed) {
    return (
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-sm text-schrift-2">
          <Lock aria-hidden className="size-3.5 shrink-0" />
          Der Ordner ist beim Start vorgegeben und hier nicht umstellbar.
        </p>
        <code className="block text-xs break-all">{current}</code>
        <div className="pt-1">{OeffnenKnopf}</div>
        {result ? (
          <p
            className={
              result.ok ? "text-sm text-akzent" : "text-sm text-warnung"
            }
          >
            {result.ok ? result.message : result.error}
          </p>
        ) : null}
        <p className="text-xs text-schrift-3">
          So ist das weitergegebene Viewer-Paket eingerichtet: sein Starter
          setzt{" "}
          <code className="rounded bg-grund-3 px-1">MEDIATHEK_LIBRARY_DIR</code>
          , damit beim Kollegen kein anderer Ordner in Frage kommt.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm">
          <span className="text-schrift-2">Aktuell </span>
          <code className="text-xs break-all">{current}</code>
        </p>
        {OeffnenKnopf}
      </div>
      {result ? (
        <p
          className={result.ok ? "text-sm text-akzent" : "text-sm text-warnung"}
        >
          {result.ok ? result.message : result.error}
        </p>
      ) : null}
      <LibraryChooser
        pathExample={pathExample}
        suggestedParent={suggestedParent}
        suggestedName={suggestedName}
        current={current}
        allowEmptyReset
      />
    </div>
  );
}
