import "server-only";

import { spawn } from "node:child_process";

import type { FfmpegTools } from "./locate";

/*
 * Wandelt eine Aufnahme aus dem Browser (WebM/Opus, das Format, das
 * MediaRecorder liefert — kein Browser kann direkt MP3 aufnehmen) in eine
 * MP3-Datei. Dieselbe Handwerkskiste wie bei Kachelbild und Wellenform, nur
 * für den umgekehrten Weg: nicht lesen, sondern schreiben.
 */

type RunResult = { ok: boolean; stderr: string };

function run(command: string, args: string[], timeoutMs = 120_000): Promise<RunResult> {
  return new Promise((resolve) => {
    let stderr = "";
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ ok, stderr });
    };

    let child;
    try {
      child = spawn(command, args, { windowsHide: true });
    } catch {
      finish(false);
      return;
    }
    child.stderr?.on("data", (chunk) => (stderr += chunk.toString("utf8")));
    child.on("error", () => finish(false));
    child.on("exit", (code) => finish(code === 0));
    const timer = setTimeout(() => {
      child.kill();
      finish(false);
    }, timeoutMs);
    timer.unref?.();
  });
}

export type TranscodeResult = { ok: true } | { ok: false; error: string };

/**
 * `-q:a 2` ist variable Bitrate um die 190 kbit/s — für eine Sprachaufnahme
 * reichlich, ohne die Datei unnötig groß zu machen. `-vn` verwirft ein
 * Videobild, falls doch eines im Container steckt.
 */
export async function transcodeToMp3(
  source: string,
  target: string,
  tools: FfmpegTools,
): Promise<TranscodeResult> {
  const result = await run(tools.ffmpeg, [
    "-y",
    "-i",
    source,
    "-vn",
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "2",
    target,
  ]);
  if (!result.ok) {
    return {
      ok: false,
      error:
        "ffmpeg konnte die Aufnahme nicht nach MP3 wandeln: " +
        (result.stderr.trim().slice(-500) || "keine weitere Meldung."),
    };
  }
  return { ok: true };
}
