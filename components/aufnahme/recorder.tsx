"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, RotateCcw, Save, Square } from "lucide-react";

import { Button, ButtonLink, Card } from "@/components/ui/basis";

/*
 * Aufnehmen, direkt im Browser.
 *
 * getUserMedia({ audio: true }) fragt nach dem Mikrofon, ohne eines
 * auszuwählen — der Browser nimmt dafür das, was systemweit als Standard
 * eingestellt ist. Genau das ist gewollt: kein Gerätemenü, ein Knopf.
 *
 * MediaRecorder liefert WebM/Opus — kein Browser nimmt direkt MP3 auf. Die
 * Wandlung übernimmt ffmpeg auf dem Server, im selben Zug wie der Import
 * (siehe app/api/import/hochladen/route.ts, "wandeln=mp3"). Hochgeladen wird
 * über denselben Weg wie jede andere Datei — danach läuft die Automatik
 * (Kachelbild, Transkription, Kapitel, Suche, Bezüge) von selbst weiter.
 */

type Phase =
  | "bereit"
  | "kein-mikrofon"
  | "laeuft"
  | "fertig"
  | "speichert"
  | "gespeichert";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Ein führendes Datum landet im Kopf der beitrag.md, nicht in der Kennung —
 *  siehe lib/import/filename.ts. Ohne Titel bleibt er dort leer. */
function buildFilename(title: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const trimmed = title.trim().replace(/\s+/g, "-");
  return `${date}-${trimmed || "Aufnahme"}.webm`;
}

export function Recorder() {
  const [phase, setPhase] = useState<Phase>("bereit");
  const [elapsed, setElapsed] = useState(0);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Aufräumen, falls die Seite verlassen wird, während noch etwas offen ist.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const start = async () => {
    setError(null);
    setNote(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(
        "Auf das Mikrofon konnte nicht zugegriffen werden. Im Browser " +
          "erlauben, oder unter den Systemeinstellungen ein Standard­mikrofon " +
          "wählen.",
      );
      setPhase("kein-mikrofon");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      blobRef.current = blob;
      setBlobUrl(URL.createObjectURL(blob));
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setPhase("fertig");
    });

    recorderRef.current = recorder;
    recorder.start();
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
    setPhase("laeuft");
  };

  const stop = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current?.stop();
  };

  const verwerfen = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    blobRef.current = null;
    setElapsed(0);
    setTitle("");
    setPhase("bereit");
  };

  const speichern = () => {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase("speichert");
    setError(null);

    const name = buildFilename(title);
    const request = new XMLHttpRequest();
    request.open(
      "PUT",
      `/api/import/hochladen?name=${encodeURIComponent(name)}&wandeln=mp3`,
    );
    request.addEventListener("load", () => {
      try {
        const data = JSON.parse(request.responseText) as {
          slug?: string;
          note?: string;
          error?: string;
        };
        if (request.status >= 200 && request.status < 300 && data.slug) {
          setSavedSlug(data.slug);
          setNote(data.note ?? "Gespeichert.");
          setPhase("gespeichert");
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          setBlobUrl(null);
          blobRef.current = null;
        } else {
          setError(data.error ?? "Fehlgeschlagen.");
          setPhase("fertig");
        }
      } catch {
        setError(`Unerwartete Antwort (${request.status}).`);
        setPhase("fertig");
      }
    });
    request.addEventListener("error", () => {
      setError("Die Verbindung ist abgebrochen.");
      setPhase("fertig");
    });
    request.send(blob);
  };

  const naechste = () => {
    setPhase("bereit");
    setSavedSlug(null);
    setNote(null);
    setTitle("");
    setElapsed(0);
  };

  return (
    <Card className="space-y-5">
      {phase !== "gespeichert" ? (
        <div className="space-y-1.5">
          <label htmlFor="aufnahme-titel" className="block text-sm font-medium">
            Titel <span className="text-schrift-3">(freiwillig)</span>
          </label>
          <input
            id="aufnahme-titel"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={phase === "laeuft" || phase === "speichert"}
            placeholder="Ohne Titel — lässt sich beim Bearbeiten nachtragen"
            className="w-full rounded-lg border border-rand bg-grund px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-3 rounded-xl border border-rand bg-grund-2 px-6 py-10">
        {phase === "bereit" || phase === "kein-mikrofon" ? (
          <>
            <Button variant="primaer" onClick={() => void start()}>
              <Mic aria-hidden className="size-4" />
              Aufnahme starten
            </Button>
            <p className="text-xs text-schrift-2">
              Nutzt das Mikrofon, das systemweit als Standard eingestellt ist.
            </p>
          </>
        ) : null}

        {phase === "laeuft" ? (
          <>
            <span
              role="status"
              className="flex items-center gap-2 text-2xl font-semibold tabular-nums"
            >
              <span className="size-2.5 animate-pulse rounded-full bg-fehler" />
              {formatElapsed(elapsed)}
            </span>
            <Button variant="primaer" onClick={stop}>
              <Square aria-hidden className="size-4" />
              Aufnahme beenden
            </Button>
          </>
        ) : null}

        {phase === "fertig" && blobUrl ? (
          <>
            <audio controls src={blobUrl} className="w-full max-w-sm" />
            <span className="text-xs text-schrift-2">
              {formatElapsed(elapsed)} aufgenommen
            </span>
            <div className="flex gap-2">
              <Button variant="leise" onClick={verwerfen}>
                <RotateCcw aria-hidden className="size-4" />
                Verwerfen
              </Button>
              <Button variant="primaer" onClick={speichern}>
                <Save aria-hidden className="size-4" />
                Speichern
              </Button>
            </div>
          </>
        ) : null}

        {phase === "speichert" ? (
          <span className="flex items-center gap-2 text-sm text-schrift-2">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Wird gespeichert und nach MP3 gewandelt …
          </span>
        ) : null}

        {phase === "gespeichert" ? (
          <>
            <p role="status" className="text-sm text-akzent">
              {note}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {savedSlug ? (
                <ButtonLink href={`/medien/${savedSlug}/bearbeiten?neu=1`}>
                  Titel eintragen
                </ButtonLink>
              ) : null}
              <ButtonLink href="/auftraege">Verarbeitung ansehen</ButtonLink>
              <Button variant="primaer" onClick={naechste}>
                <Mic aria-hidden className="size-4" />
                Noch eine Aufnahme
              </Button>
            </div>
          </>
        ) : null}
      </div>

      {error ? <p className="text-sm text-warnung">{error}</p> : null}
    </Card>
  );
}
