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
export const WHISPER_MODELS = [
  "large-v3-turbo",
  "large-v3",
  "small",
] as const;

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
};

const DEFAULTS: Settings = {
  authorMode: false,
  ffmpegDir: null,
  lastLibraryDir: null,
  whisperModel: "large-v3-turbo",
  whisperLanguage: "de",
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
        typeof record.lastLibraryDir === "string" && record.lastLibraryDir.trim()
          ? record.lastLibraryDir
          : null,
      whisperModel: model,
      whisperLanguage:
        typeof record.whisperLanguage === "string"
          ? record.whisperLanguage.trim().slice(0, 8)
          : DEFAULTS.whisperLanguage,
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
