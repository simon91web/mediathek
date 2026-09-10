"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/basis";
import { formatBytes } from "@/lib/library/media-kind";
import { cn } from "@/lib/utils";

/*
 * Drag & Drop mit Fortschritt.
 *
 * XMLHttpRequest, nicht fetch: fetch kann den Fortschritt beim Hochladen
 * nicht melden (dafür bräuchte es duplex-fähige Request-Ströme, die Browser
 * nicht praktikabel anbieten). Das ist auch 2026 noch die richtige Antwort.
 */

type Entry = {
  name: string;
  size: number;
  sent: number;
  state: "wartet" | "laeuft" | "fertig" | "fehler";
  note: string | null;
};

function uploadOne(
  file: File,
  onProgress: (sent: number) => void,
): Promise<{ ok: true; note: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    const url = `/api/import/hochladen?name=${encodeURIComponent(file.name)}`;
    request.open("PUT", url);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    });
    request.addEventListener("load", () => {
      try {
        const data = JSON.parse(request.responseText) as {
          note?: string;
          error?: string;
        };
        if (request.status >= 200 && request.status < 300) {
          resolve({ ok: true, note: data.note ?? "Eingelesen." });
        } else {
          resolve({ ok: false, error: data.error ?? "Fehlgeschlagen." });
        }
      } catch {
        resolve({
          ok: false,
          error: `Unerwartete Antwort (${request.status}).`,
        });
      }
    });
    request.addEventListener("error", () =>
      resolve({ ok: false, error: "Die Verbindung ist abgebrochen." }),
    );
    request.addEventListener("abort", () =>
      resolve({ ok: false, error: "Abgebrochen." }),
    );
    request.send(file);
  });
}

export function UploadDropzone() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setEntries(
      files.map((file) => ({
        name: file.name,
        size: file.size,
        sent: 0,
        state: "wartet",
        note: null,
      })),
    );

    // Nacheinander: auf einem Netzlaufwerk ist parallel langsamer.
    for (let index = 0; index < files.length; index += 1) {
      setEntries((current) =>
        current.map((entry, i) =>
          i === index ? { ...entry, state: "laeuft" } : entry,
        ),
      );

      const result = await uploadOne(files[index], (sent) => {
        setEntries((current) =>
          current.map((entry, i) => (i === index ? { ...entry, sent } : entry)),
        );
      });

      setEntries((current) =>
        current.map((entry, i) =>
          i === index
            ? {
                ...entry,
                state: result.ok ? "fertig" : "fehler",
                note: result.ok ? result.note : result.error,
                sent: result.ok ? entry.size : entry.sent,
              }
            : entry,
        ),
      );
    }

    setBusy(false);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void handleFiles([...event.dataTransfer.files]);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          over ? "border-akzent bg-akzent/5" : "border-rand",
        )}
      >
        <Upload aria-hidden className="mx-auto size-6 text-schrift-3" />
        <p className="mt-2 text-sm font-medium">
          Dateien hierher ziehen
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-schrift-2">
          Videos, Sprachmemos und Markdown-Dateien. Jede Datei bekommt einen
          eigenen Ordner in der Bibliothek; das Original bleibt, wo es ist.
        </p>
        {/*
          Das versteckte Feld ist nicht nur Beiwerk: es macht die Fläche mit
          der Tastatur bedienbar, und Playwright kann setInputFiles nutzen —
          echtes Ziehen und Ablegen ist im Test kaum stabil zu bekommen.
        */}
        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => {
            void handleFiles([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
        <Button
          size="klein"
          className="mt-3"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Dateien auswählen
        </Button>
      </div>

      {entries.length > 0 ? (
        <ul className="space-y-1.5">
          {entries.map((entry, index) => {
            const ratio = entry.size > 0 ? entry.sent / entry.size : 0;
            return (
              <li
                key={`${entry.name}-${index}`}
                className="rounded-lg border border-rand bg-grund-2 px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{entry.name}</span>
                  <span className="shrink-0 text-xs text-schrift-3 tabular-nums">
                    {entry.state === "laeuft"
                      ? `${Math.round(ratio * 100)} %`
                      : formatBytes(entry.size)}
                  </span>
                </div>
                {entry.state === "laeuft" || entry.state === "wartet" ? (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-grund-3">
                    <div
                      className="h-full bg-akzent transition-[width]"
                      style={{ width: `${(ratio * 100).toFixed(1)}%` }}
                    />
                  </div>
                ) : null}
                {entry.note ? (
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      entry.state === "fehler" ? "text-warnung" : "text-schrift-2",
                    )}
                  >
                    {entry.note}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
