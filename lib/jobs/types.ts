/**
 * Aufträge, die länger laufen als eine Anfrage. Ohne "server-only": der
 * Client braucht die Typen für die Fortschrittsanzeige.
 */

export type JobKind =
  | "transkription"
  | "kachelbild"
  | "anhangtext"
  | "kapitel"
  | "suchindex"
  | "bezuege"
  | "fragen"
  | "pythonsetup";

export type JobState =
  "wartet" | "laeuft" | "fertig" | "fehler" | "abgebrochen";

export type JobErrorCode =
  | "ffmpeg_missing"
  | "ffmpeg_failed"
  | "no_audio_stream"
  | "python_missing"
  | "model_download_failed"
  | "gpu_unavailable"
  | "gpu_lost"
  | "out_of_memory"
  | "assistant_missing"
  | "assistant_failed"
  | "kette_unterbrochen"
  | "canceled"
  | "server_neu_gestartet"
  | "internal";

export type Job = {
  /** Sortierbar, damit die Reihenfolge ohne Zeitstempel stimmt. */
  id: string;
  kind: JobKind;
  slug: string;
  /** Titel des Beitrags, damit die Anzeige nicht nachfragen muss. */
  title: string;
  state: JobState;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** 0 bis 1, monoton steigend. */
  progress: number;
  /** "download" | "ffmpeg" | "transcribe" | "write" — für die Anzeige. */
  stage: string;
  /** Ein deutscher Einzeiler, direkt anzeigbar. */
  message: string;
  etaSec: number | null;
  /** Verhältnis von verarbeiteter Medienzeit zu Laufzeit. */
  speed: number | null;
  deviceUsed: "cuda" | "cpu" | null;
  fallbackReason: string | null;
  /** Prozesskennung des Kindprozesses, solange er läuft. */
  pid: number | null;
  /** Zählt den einen CPU-Wiederholungsversuch. */
  attempt: number;
  error: { code: JobErrorCode; message: string; detail?: string } | null;
  /** Absoluter Pfad des Protokolls, maschinenlokal. */
  logFile: string | null;
  /**
   * Gehört dieser Auftrag zu einer Kette? Dann wird er übersprungen, sobald
   * ein früherer Schritt derselben Kette gescheitert ist — Kapitel ohne
   * Transkript wären erfunden.
   */
  chain: { id: string; step: number; total: number } | null;
};

export type JobSnapshot = {
  jobs: Job[];
  /** Der gerade laufende Auftrag, falls es einen gibt. */
  runningId: string | null;
};

export const KIND_LABEL: Record<JobKind, string> = {
  transkription: "Transkription",
  kachelbild: "Kachelbild",
  anhangtext: "Anhänge lesen",
  kapitel: "Kapitel und Zusammenfassung",
  suchindex: "Suche aktualisieren",
  bezuege: "Verwandte Stellen",
  fragen: "Fragen zusammenfassen",
  pythonsetup: "Python einrichten",
};

/** Welche Arten ein KI-Werkzeug starten — für Hinweis und Riegel. */
export const ASSISTANT_KINDS: readonly JobKind[] = [
  "kapitel",
  "bezuege",
  "fragen",
];

export function isAssistantKind(kind: JobKind): boolean {
  return ASSISTANT_KINDS.includes(kind);
}

export const STAGE_LABEL: Record<string, string> = {
  warten: "wartet",
  download: "Modell wird geladen",
  ffmpeg: "Tonspur wird gelesen",
  transcribe: "Transkription",
  write: "wird geschrieben",
  poster: "Kachelbild",
  extract: "Anhänge werden gelesen",
  assistent: "Das Werkzeug arbeitet",
  suchindex: "Index wird gebaut",
  python: "Pakete werden geladen",
};

export function isFinished(state: JobState): boolean {
  return state === "fertig" || state === "fehler" || state === "abgebrochen";
}
