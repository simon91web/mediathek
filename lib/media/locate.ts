import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";

import { readSettings } from "@/lib/settings";

/*
 * ffmpeg und ffprobe finden.
 *
 * "ffmpeg-Pfad" bedeutet hier IMMER das Verzeichnis, nie die Datei: der
 * übliche Windows-Build ist ein shared build, bei dem neben ffmpeg.exe sieben
 * DLLs liegen (avcodec, avformat, avutil, swresample, swscale …). Eine
 * einzeln kopierte ffmpeg.exe startet nicht.
 */

export type FfmpegTools = {
  /** Verzeichnis, oder null wenn über den Suchpfad erreichbar. */
  dir: string | null;
  ffmpeg: string;
  ffprobe: string;
  source: "einstellungen" | "umgebung" | "beiliegend" | "suchpfad";
};

const EXE = process.platform === "win32" ? ".exe" : "";

export function ffmpegBinaries(): { ffmpeg: string; ffprobe: string } {
  return { ffmpeg: `ffmpeg${EXE}`, ffprobe: `ffprobe${EXE}` };
}

function binary(dir: string | null, name: string): string {
  return dir ? path.join(dir, `${name}${EXE}`) : name;
}

/** Prüft durch echten Aufruf, nicht durch Pfadsuche. */
function works(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const child = spawn(command, ["-version"], {
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", () => finish(false));
      child.on("exit", (code) => finish(code === 0));
      setTimeout(() => {
        child.kill();
        finish(false);
      }, 5_000).unref?.();
    } catch {
      finish(false);
    }
  });
}

export class MediaToolsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaToolsError";
  }
}

/**
 * Reihenfolge absichtlich mit den Einstellungen zuerst: ffmpeg ist auf dieser
 * Maschine nicht systemweit installiert, sondern liegt in einem entpackten
 * Ordner. Eine ausdrückliche Einstellung muss einen veralteten Eintrag im
 * Suchpfad schlagen können.
 */
export async function locateFfmpeg(): Promise<FfmpegTools | null> {
  const settings = await readSettings();

  const candidates: Array<{ dir: string | null; source: FfmpegTools["source"] }> =
    [];
  if (settings.ffmpegDir) {
    candidates.push({ dir: settings.ffmpegDir, source: "einstellungen" });
  }
  if (process.env.MEDIATHEK_FFMPEG_DIR) {
    candidates.push({
      dir: process.env.MEDIATHEK_FFMPEG_DIR,
      source: "umgebung",
    });
  }
  // Neben dem Viewer-Paket, falls jemand ffmpeg mitliefert.
  candidates.push({
    dir: path.join(process.cwd(), "ffmpeg", "bin"),
    source: "beiliegend",
  });
  candidates.push({ dir: null, source: "suchpfad" });

  for (const candidate of candidates) {
    const ffprobe = binary(candidate.dir, "ffprobe");
    if (await works(ffprobe)) {
      return {
        dir: candidate.dir,
        ffmpeg: binary(candidate.dir, "ffmpeg"),
        ffprobe,
        source: candidate.source,
      };
    }
  }
  return null;
}

/** Wie locateFfmpeg, wirft aber mit einer Meldung, die weiterhilft. */
export async function requireFfmpeg(): Promise<FfmpegTools> {
  const tools = await locateFfmpeg();
  if (tools) return tools;
  const { ffmpeg, ffprobe } = ffmpegBinaries();
  throw new MediaToolsError(
    "ffmpeg wurde nicht gefunden. Gebraucht werden " +
      `${ffmpeg} und ${ffprobe}, um Dauer, Kachelbild und Tonspur zu lesen. ` +
      "Gesucht wurde in den Einstellungen, in MEDIATHEK_FFMPEG_DIR, neben " +
      "der Anwendung und im Suchpfad. Den Ordner mit den beiden Dateien " +
      "unter Einstellungen eintragen.",
  );
}
