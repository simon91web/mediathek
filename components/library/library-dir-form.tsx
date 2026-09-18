"use client";

import { useState, useTransition } from "react";
import { FolderOpen, FolderTree, Lock } from "lucide-react";

import {
  openLibraryFolderAction,
  pickLibraryFolderAction,
  setLibraryDirAction,
} from "@/app/einstellungen/actions";
import type { ActionResult } from "@/app/einstellungen/actions";
import { Button } from "@/components/ui/basis";

/*
 * Der Bibliotheksordner — der Ordner, in dem alles landet, was hochgeladen
 * wird, und aus dem alles gelesen wird.
 *
 * Ein Textfeld UND ein Ordnerdialog: `webkitdirectory` liefert zwar nur
 * Dateinamen relativ zur Auswahl, nie den Pfad selbst — aber der native
 * Dialog des Betriebssystems (wie beim Begrüßungsschirm) tut genau das.
 * Das Feld bleibt daneben bestehen, für UNC-Pfade, die man aus der
 * Adresszeile des Explorers einfügt, ohne dass der Dialog sie überhaupt
 * anbieten könnte.
 */

export function LibraryDirForm({
  current,
  fixed,
}: {
  current: string;
  /** true, wenn MEDIATHEK_LIBRARY_DIR gesetzt ist — dann ist nichts wählbar. */
  fixed: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(current);
  const [result, setResult] = useState<ActionResult | null>(null);

  const oeffnen = () => {
    startTransition(async () => {
      setResult(await openLibraryFolderAction());
    });
  };

  const OeffnenKnopf = (
    <Button size="klein" disabled={pending} onClick={oeffnen}>
      <FolderOpen aria-hidden className="size-3.5" />
      Im Explorer öffnen
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

  const submit = () => {
    startTransition(async () => {
      setResult(await setLibraryDirAction(value));
    });
  };

  const durchsuchen = () => {
    setResult(null);
    startTransition(async () => {
      const gewaehlt = await pickLibraryFolderAction();
      if (gewaehlt.ok) {
        setValue(gewaehlt.dir);
        return;
      }
      if (!gewaehlt.canceled) {
        setResult({ ok: false, error: gewaehlt.error ?? "Der Dialog ging nicht." });
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <FolderTree
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-schrift-3"
          />
          <input
            type="text"
            value={value}
            spellCheck={false}
            autoComplete="off"
            disabled={pending}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder={String.raw`S:\Mediathek`}
            aria-label="Bibliotheksordner"
            className="h-10 w-full rounded-lg border border-rand bg-grund-2 pr-3 pl-8 font-mono text-xs disabled:opacity-50"
          />
        </div>
        <Button size="klein" disabled={pending} onClick={durchsuchen}>
          <FolderOpen aria-hidden className="size-3.5" />
          Durchsuchen
        </Button>
        <Button
          variant="primaer"
          disabled={pending || value.trim() === current}
          onClick={submit}
        >
          {pending ? "Wechselt …" : "Übernehmen"}
        </Button>
        {OeffnenKnopf}
      </div>

      <p className="text-xs text-schrift-2">
        Hier liegen alle Beiträge, und hierhin wird hochgeladen. Der Ordner darf
        auf einem Netzlaufwerk liegen — besser als UNC-Pfad
        (&#92;&#92;10.0.4.200&#92;Geteilt&#92;Mediathek), denn ein gemappter
        Laufwerksbuchstabe gilt nur in der angemeldeten Windows-Sitzung; der
        Ordner-Dialog liefert einen gemappten Laufwerksbuchstaben, falls
        einer gewählt wird — für einen UNC-Pfad hilft nur das Einfügen von
        Hand. Der Ordner muss vorhanden sein; ein leerer ist in Ordnung. Feld
        leeren und übernehmen stellt auf den Standard zurück.
      </p>

      {result ? (
        <p
          className={result.ok ? "text-sm text-akzent" : "text-sm text-warnung"}
        >
          {result.ok ? result.message : result.error}
        </p>
      ) : null}
    </div>
  );
}
