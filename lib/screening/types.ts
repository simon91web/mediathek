import type { MediaKind, Slug } from "@/lib/library/types";

/*
 * Eine Datei, die noch NICHT in der Bibliothek steckt — Sichtung statt
 * Beitrag. Absichtlich schlank: kein `Item`, weil `assets.dir`, `fingerprint`
 * und der Rest erst beim echten Import entstehen.
 */

export type ScreeningVerdict = "neu" | "aehnlich" | "vorhanden" | "unklar";

export type ScreeningMatch = {
  slug: Slug;
  title: string;
  /** [[slug#…]], anklickbar über die vorhandene Wikilink-Anzeige. */
  raw: string;
};

export type ScreeningCandidate = {
  /** Absoluter Pfad auf der Quellmaschine — wird für den späteren Import gebraucht. */
  sourcePath: string;
  /** Kurzer Schlüssel aus dem Pfad — Job-Kennwort und Scratch-Ordnername. */
  hash: string;
  fileName: string;
  kind: MediaKind | null;
  titleGuess: string | null;
  slugGuess: Slug;
  /** Der Wurzel-Slug ist schon vergeben — starkes, KI-freies Duplikat-Signal. */
  slugTaken: boolean;
  recorded: string | null;
  durationSec: number | null;
  sizeBytes: number | null;
  /**
   * Wächst über den Ablauf: erst "wartet", nach der Transkription ein
   * Urteil. "pausiert" ist rein clientseitig — kein Job-Zustand, sondern
   * "hier wartet noch etwas, aber absichtlich ohne laufenden Auftrag".
   */
  state: "wartet" | "laeuft" | "fertig" | "fehler" | "pausiert";
  /** Job-Kennung, solange die Transkription läuft oder wartet. */
  jobId: string | null;
  /** Nur während `state === "laeuft"` gefüllt — direkt aus dem Job übernommen. */
  progress: number;
  stageMessage: string | null;
  deviceUsed: "cuda" | "cpu" | null;
  speed: number | null;
  verdict: ScreeningVerdict | null;
  summary: string | null;
  matches: readonly ScreeningMatch[];
  error: string | null;
};
