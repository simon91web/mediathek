"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FolderInput } from "lucide-react";

import { importFolderAction } from "@/app/importieren/actions";
import type { FolderImportResult } from "@/app/importieren/actions";
import { Button } from "@/components/ui/basis";
import { cn } from "@/lib/utils";

/**
 * "Ordner einlesen" für Dateien, die schon irgendwo liegen.
 *
 * Kein Ordner-Auswahldialog: eine Next-App kann keinen öffnen, und
 * `webkitdirectory` liefert nur Dateinamen, keinen serverseitig nutzbaren
 * Pfad. Ein Einfügefeld mit klarem Beispiel ist ehrlich und funktioniert.
 */
export function FolderImport() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pfad, setPfad] = useState("");
  const [verschieben, setVerschieben] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<FolderImportResult | null>(null);

  const run = () => {
    setResult(null);
    setConfirming(false);
    startTransition(async () => {
      const outcome = await importFolderAction({ pfad, verschieben });
      setResult(outcome);
      if (outcome.imported.length > 0) router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="import-pfad" className="block text-sm font-medium">
          Ordner einlesen
        </label>
        <p className="text-xs text-schrift-2">
          Pfad zu einem Ordner auf dieser Maschine oder im Netz. Es werden bis
          zu drei Ebenen tief alle Video-, Audio- und Markdown-Dateien
          gefunden.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            id="import-pfad"
            type="text"
            value={pfad}
            onChange={(event) => setPfad(event.target.value)}
            placeholder="D:\Aufnahmen\2026 oder \\10.0.4.200\Geteilt\Rohvideos"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-rand bg-grund px-3 py-2 font-mono text-xs"
          />
          <Button
            disabled={pending || !pfad.trim()}
            onClick={() => (verschieben ? setConfirming(true) : run())}
          >
            <FolderInput aria-hidden className="size-4" />
            {pending ? "Liest ein …" : "Einlesen"}
          </Button>
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={verschieben}
          onChange={(event) => {
            setVerschieben(event.target.checked);
            setConfirming(false);
          }}
          className="mt-0.5 accent-akzent"
        />
        <span className="text-schrift-2">
          Dateien <strong>verschieben</strong> statt kopieren. Standard ist
          kopieren, weil die Quelldateien möglicherweise die einzigen
          Originale sind.
        </span>
      </label>

      {confirming ? (
        <div className="space-y-2 rounded-lg border border-warnung/40 bg-warnung-grund p-3">
          <p className="flex items-start gap-2 text-sm text-warnung">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Die Dateien werden aus <code className="text-xs">{pfad}</code>{" "}
              <strong>entfernt</strong> und liegen danach nur noch in der
              Bibliothek. Wirklich verschieben?
            </span>
          </p>
          <div className="flex gap-2">
            <Button size="klein" variant="primaer" onClick={run}>
              Ja, verschieben
            </Button>
            <Button size="klein" onClick={() => setConfirming(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-1.5">
          {result.error ? (
            <p className="text-sm text-warnung">{result.error}</p>
          ) : null}
          {result.lines.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-rand bg-grund-2 p-3">
              {result.lines.map((line, index) => (
                <li
                  key={index}
                  className={cn(
                    "text-xs",
                    line.includes("konnte nicht") || line.includes("kennt")
                      ? "text-warnung"
                      : "text-schrift-2",
                  )}
                >
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
