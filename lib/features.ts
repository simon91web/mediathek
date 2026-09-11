import "server-only";

import { spawn } from "node:child_process";

import { findPythonEnv } from "@/lib/jobs/python";
import { locateFfmpeg } from "@/lib/media/locate";
import { isReadonly, readSettings } from "@/lib/settings";

/*
 * Was diese Maschine kann. Wird beim ersten Zugriff ermittelt und gemerkt.
 *
 * Harte Regel: kein Modul im Render-Pfad darf tools/ oder ffmpeg anfassen.
 * Ein Zuschauer ohne Python und ohne ffmpeg muss die Mediathek vollständig
 * benutzen können — Transkription und Kachelbilder sind reine Autorensache.
 */

export type ToolState = "ok" | "fehlt";

export type Features = {
  /** Darf geschrieben werden? */
  authorMode: boolean;
  /** Ist der Autorenmodus hart abgeschaltet (Viewer-Paket)? */
  readonly: boolean;
  ffmpeg: ToolState;
  /** Verzeichnis, in dem ffmpeg gefunden wurde. */
  ffmpegDir: string | null;
  /** Python-Umgebung für die Transkription. */
  python: ToolState;
  /**
   * Das eingestellte KI-Kommandozeilenwerkzeug — voreingestellt "claude",
   * frei wählbar. Geprüft wird der Name aus den Einstellungen, nicht ein
   * fest verdrahtetes Programm.
   */
  assistant: ToolState;
  /** Der geprüfte Programmname, für Meldungen. */
  assistantCommand: string;
};

type Cache = { at: number; features: Features };

const globalForFeatures = globalThis as unknown as {
  mediathekFeatures?: Cache;
};

/** Fünf Minuten reichen: wer ffmpeg installiert, kann kurz warten. */
const TTL_MS = 5 * 60_000;

/** Prüft ein Programm durch echten Aufruf, nicht durch Pfadsuche. */
function probe(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    try {
      const child = spawn(command, args, {
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", () => finish(false));
      child.on("exit", (code) => finish(code === 0));
      // Ein hängendes Programm darf die Seite nicht aufhalten.
      setTimeout(() => {
        child.kill();
        finish(false);
      }, 4_000).unref?.();
    } catch {
      finish(false);
    }
  });
}


export async function getFeatures(force = false): Promise<Features> {
  const cached = globalForFeatures.mediathekFeatures;
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return cached.features;
  }

  const settings = await readSettings();
  const readonly = isReadonly();

  const [ffmpeg, python, assistant] = await Promise.all([
    locateFfmpeg(),
    findPythonEnv(),
    /*
     * Der Name kommt aus den Einstellungen und ist dort gegen eine enge
     * Grammatik geprüft (isToolName): keine Pfade, keine Leerzeichen. Ein
     * beliebiger String aus einer verbogenen settings.json landet hier also
     * nicht in einem spawn.
     */
    probe(settings.assistantCommand, ["--version"]),
  ]);

  const features: Features = {
    /*
     * Im Entwicklungsbetrieb standardmäßig an, damit das Bearbeiten ohne
     * Vorbereitung funktioniert. Im Betrieb muss er ausdrücklich
     * eingeschaltet werden — und im weitergegebenen Viewer geht das nicht.
     */
    authorMode: readonly
      ? false
      : settings.authorMode || process.env.NODE_ENV === "development",
    readonly,
    ffmpeg: ffmpeg ? "ok" : "fehlt",
    ffmpegDir: ffmpeg?.dir ?? null,
    python: python ? "ok" : "fehlt",
    assistant: assistant ? "ok" : "fehlt",
    assistantCommand: settings.assistantCommand,
  };

  globalForFeatures.mediathekFeatures = { at: Date.now(), features };
  return features;
}

/** Wird beim Ein- und Ausschalten des Autorenmodus gerufen. */
export function invalidateFeatures(): void {
  globalForFeatures.mediathekFeatures = undefined;
}

export class NotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotAllowedError";
  }
}

/**
 * Vor JEDEM schreibenden Vorgang. Serverseitig, nicht in der Oberfläche —
 * ein verstecktes Bedienelement ist keine Absicherung.
 */
export async function assertAuthorMode(): Promise<void> {
  const features = await getFeatures();
  if (features.readonly) {
    throw new NotAllowedError(
      "Diese Mediathek ist zum Ansehen eingerichtet. Änderungen sind hier " +
        "nicht möglich.",
    );
  }
  if (!features.authorMode) {
    throw new NotAllowedError(
      "Der Autorenmodus ist aus. Er lässt sich unter Einstellungen " +
        "einschalten.",
    );
  }
}
