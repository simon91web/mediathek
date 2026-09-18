import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { paths } from "@/lib/paths";

/*
 * Maschinenlokale Einstellungen — ausdrücklich NICHT in der Bibliothek.
 *
 * Drei Gründe: die Bibliothek wird weitergegeben und herumkopiert; der
 * Laufwerksbuchstabe von Kollege A ist nicht der von Kollege B; und Pfade zu
 * Programmen, Job-Zustände und der Autorenmodus haben in einem Ordner, den
 * mehrere Leute lesen, nichts zu suchen.
 *
 * LOCALAPPDATA statt APPDATA, weil nichts davon einem Roaming-Profil folgen
 * soll.
 */

/**
 * Modelle, die für deutsche Fachvorträge in Frage kommen.
 *
 * Nachgemessen auf einer RTX 4070: large-v3-turbo transkribiert etwa
 * fünfundzwanzigmal schneller als Echtzeit, ein 90-Minuten-Beitrag also in
 * knapp vier Minuten. Es ist large-v3s Encoder mit einem
 * Vier-Schichten-Decoder — bei nah mikrofoniertem Vortragston liegt der
 * Unterschied zu large-v3 im Bereich eines Prozentpunkts, bei einem
 * Vielfachen der Laufzeit.
 *
 * "medium" fehlt bewusst: schlechteres Deutsch (Training vor v3) UND
 * langsamer als turbo, dessen winziger Decoder mediums 24 Schichten schlägt.
 */
export const WHISPER_MODELS = ["large-v3-turbo", "large-v3", "small"] as const;

export type WhisperModel = (typeof WHISPER_MODELS)[number];

export type Settings = {
  /** Nur wer das setzt, darf schreiben. Standard: aus. */
  authorMode: boolean;
  /** Verzeichnis mit ffmpeg.exe UND ffprobe.exe (nicht die Datei selbst). */
  ffmpegDir: string | null;
  /** Zuletzt geöffnete Bibliothek — für den Start ohne Umgebungsvariable. */
  lastLibraryDir: string | null;
  whisperModel: WhisperModel;
  /** Leer heißt: Sprache erkennen lassen. */
  whisperLanguage: string;
  /**
   * Nach einem Import von selbst transkribieren, Kachelbilder erzeugen und
   * Anhänge lesen. Standard an — das ist der Grund, ein Programm dafür zu
   * haben. Aus, wenn man die Grafikkarte gerade für etwas anderes braucht.
   */
  autoJobs: boolean;
  /**
   * Das Kommandozeilenwerkzeug, das Kapitel, Zusammenfassungen, Bezüge und
   * Themenseiten erzeugt. Frei wählbar — die Anleitungen in der Bibliothek
   * setzen kein bestimmtes Programm voraus, sie beschreiben nur Dateien.
   *
   * Nur der Programmname, kein Pfad: er muss im Suchpfad stehen.
   */
  assistantCommand: string;
  /**
   * Argumente VOR dem Auftragstext, etwa "exec" oder "-p". Manche Werkzeuge
   * brauchen so ein Wort, um einen Auftrag entgegenzunehmen.
   */
  assistantArgs: string[];
  /**
   * Der Chat über die Bibliothek. Standard AUS: er startet bei jeder Frage
   * einen Prozess, der die Dateien liest — das soll man ausdrücklich wollen.
   */
  chatEnabled: boolean;
  /**
   * Argumente für den EINMALIGEN Aufruf im Chat, etwa "-p" (claude) oder
   * "exec" (codex). Getrennt von assistantArgs: dort geht ein Fenster auf,
   * hier wird eine Antwort erwartet und zurückgelesen.
   */
  chatArgs: string[];
  /**
   * Darf der Chat zusätzlich das Internet lesen?
   *
   * Getrennt vom Chat selbst, weil es eine andere Entscheidung ist: der Chat
   * bleibt sonst im eigenen Bestand, und genau das ist sein Wert. Wer das
   * hier einschaltet, bekommt einen Schalter an der Frage — an, nicht
   * automatisch.
   */
  chatWebAllowed: boolean;
  /**
   * Die zusätzlichen Argumente für eine Frage MIT Internet. Werkzeugsache:
   * claude verlangt "--allowedTools WebSearch", andere etwas anderes.
   */
  chatWebArgs: string[];
  /**
   * Dürfen KI-Schritte OHNE Fenster laufen?
   *
   * Das ist die Voraussetzung für die Kette: ein Fenster, das auf eine
   * Eingabe wartet, ist kein Kettenglied. Standard AUS — wer es
   * einschaltet, lässt ein Programm unbeaufsichtigt in die eigenen Dateien
   * schreiben, und das soll eine Entscheidung sein.
   */
  autoAssistant: boolean;
  /**
   * Die Argumente für den unbeaufsichtigten Lauf. Werkzeugsache: neben dem
   * Einmal-Aufruf ("-p") braucht es die Erlaubnis zu schreiben, bei claude
   * "--permission-mode acceptEdits".
   */
  autoAssistantArgs: string[];
  /**
   * Nach einem Import auch die KI-Schritte der Kette anstellen (Kapitel,
   * Bezüge). Ohne das endet die Automatik beim Transkript.
   */
  autoChain: boolean;
  /**
   * Der Rundgang durch die Oberfläche wurde schon gezeigt (fertig durchlaufen
   * oder übersprungen) — er öffnet sich dann nicht noch einmal von selbst.
   * Wie lastLibraryDir maschinenlokal: jede Maschine sieht ihn beim eigenen
   * ersten Start, unabhängig davon, wer die Bibliothek sonst noch nutzt.
   */
  platformTourSeen: boolean;
};

const DEFAULTS: Settings = {
  authorMode: false,
  ffmpegDir: null,
  lastLibraryDir: null,
  whisperModel: "large-v3-turbo",
  whisperLanguage: "de",
  autoJobs: true,
  assistantCommand: "claude",
  assistantArgs: [],
  chatEnabled: false,
  chatArgs: ["-p"],
  chatWebAllowed: false,
  chatWebArgs: ["--allowedTools", "WebSearch"],
  autoAssistant: false,
  autoAssistantArgs: ["-p", "--permission-mode", "acceptEdits"],
  autoChain: false,
  platformTourSeen: false,
};

function stateRoot(): string {
  const base =
    process.env.LOCALAPPDATA ??
    process.env.XDG_STATE_HOME ??
    path.join(os.homedir(), ".local", "state");
  return path.join(base, "Mediathek");
}

/** Ein Zustandsverzeichnis je Bibliothek, damit zwei Bibliotheken sich nicht mischen. */
export function libraryStateDir(): string {
  const hash = createHash("sha256")
    .update(path.resolve(paths.library).toLowerCase())
    .digest("hex")
    .slice(0, 12);
  return path.join(stateRoot(), hash);
}

export function settingsFile(): string {
  return path.join(stateRoot(), "settings.json");
}

/**
 * Programmname oder Argument — ohne Pfad, Leerzeichen oder Sonderzeichen.
 *
 * Die Prüfung steht hier und nicht erst im Startskript, damit eine von Hand
 * verbogene settings.json gar nicht erst bis dorthin kommt. Dieselbe
 * Grammatik erzwingt das Skript noch einmal per ValidatePattern.
 */
export function isToolName(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,40}$/.test(value);
}

/**
 * Liest die Einstellungen. Eine von Hand verbogene Datei degradiert auf die
 * Standardwerte statt einen Absturz zu erzeugen.
 */
export async function readSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsFile(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULTS };
    const record = parsed as Record<string, unknown>;
    const model = WHISPER_MODELS.includes(record.whisperModel as WhisperModel)
      ? (record.whisperModel as WhisperModel)
      : DEFAULTS.whisperModel;

    return {
      authorMode: record.authorMode === true,
      ffmpegDir:
        typeof record.ffmpegDir === "string" && record.ffmpegDir.trim()
          ? record.ffmpegDir
          : null,
      lastLibraryDir:
        typeof record.lastLibraryDir === "string" &&
        record.lastLibraryDir.trim()
          ? record.lastLibraryDir
          : null,
      whisperModel: model,
      whisperLanguage:
        typeof record.whisperLanguage === "string"
          ? record.whisperLanguage.trim().slice(0, 8)
          : DEFAULTS.whisperLanguage,
      // Nur ein ausdrückliches false schaltet die Automatik ab.
      autoJobs: record.autoJobs !== false,
      assistantCommand: isToolName(record.assistantCommand)
        ? (record.assistantCommand as string)
        : DEFAULTS.assistantCommand,
      assistantArgs: Array.isArray(record.assistantArgs)
        ? record.assistantArgs.filter(isToolName).slice(0, 4)
        : [],
      chatEnabled: record.chatEnabled === true,
      chatArgs: Array.isArray(record.chatArgs)
        ? record.chatArgs.filter(isToolName).slice(0, 4)
        : DEFAULTS.chatArgs,
      chatWebAllowed: record.chatWebAllowed === true,
      chatWebArgs: Array.isArray(record.chatWebArgs)
        ? record.chatWebArgs.filter(isToolName).slice(0, 6)
        : DEFAULTS.chatWebArgs,
      autoAssistant: record.autoAssistant === true,
      autoAssistantArgs: Array.isArray(record.autoAssistantArgs)
        ? record.autoAssistantArgs.filter(isToolName).slice(0, 8)
        : DEFAULTS.autoAssistantArgs,
      autoChain: record.autoChain === true,
      platformTourSeen: record.platformTourSeen === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Schreibt atomar; ein Fehlschlag wird gemeldet, nicht geworfen. */
export async function writeSettings(
  next: Partial<Settings>,
): Promise<{ ok: boolean; error: string | null }> {
  const merged = { ...(await readSettings()), ...next };
  const file = settingsFile();
  const temporary = `${file}.tmp`;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(merged, null, 2), "utf8");
    await fs.rename(temporary, file);
    return { ok: true, error: null };
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Der harte Riegel für das weitergegebene Viewer-Paket: ist die Variable
 * gesetzt, lässt sich der Autorenmodus nicht einschalten — kein
 * Bedienelement, kein Query-Parameter, kein Cookie kann daran vorbei.
 */
export function isReadonly(): boolean {
  const value = process.env.MEDIATHEK_READONLY;
  return value === "1" || value === "true";
}
