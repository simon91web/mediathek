import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { markOwnWrite } from "@/lib/library/store";
import { ITEM_FILES } from "@/lib/paths";
import type { FfmpegTools } from "./locate";

/*
 * Kachelbilder.
 *
 * Bei Video ein Einzelbild, das etwas zeigt — nicht den schwarzen Vorlauf,
 * den jede selbst aufgenommene Aufnahme hat. Bei Audio die Wellenform: die
 * ist billig zu erzeugen und sagt mehr als ein Platzhaltersymbol.
 */

/** Erlaubte Helligkeit eines Kachelbilds (0–255). Darunter ist es schwarz. */
const MIN_BRIGHTNESS = 24;
const MAX_BRIGHTNESS = 232;

type RunResult = { ok: boolean; stdout: string; stderr: string };

function run(command: string, args: string[], timeoutMs = 120_000): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ ok, stdout, stderr });
    };

    let child;
    try {
      child = spawn(command, args, { windowsHide: true });
    } catch {
      finish(false);
      return;
    }
    child.stdout?.on("data", (chunk) => (stdout += chunk.toString("utf8")));
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

/**
 * Mittlere Helligkeit eines Bilds. Damit lässt sich erkennen, ob das
 * gewählte Einzelbild doch nur Schwarz zeigt.
 */
async function brightness(
  file: string,
  tools: FfmpegTools,
): Promise<number | null> {
  const result = await run(tools.ffmpeg, [
    "-hide_banner",
    "-i",
    file,
    "-vf",
    "signalstats,metadata=print:key=lavfi.signalstats.YAVG",
    "-f",
    "null",
    "-",
  ]);
  const match = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(result.stderr + result.stdout);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

async function moveIntoPlace(from: string, to: string): Promise<void> {
  markOwnWrite(to);
  await fs.mkdir(path.dirname(to), { recursive: true });
  try {
    await fs.rename(from, to);
  } catch {
    // Über Volumegrenzen scheitert rename.
    await fs.copyFile(from, to);
    await fs.rm(from, { force: true });
  }
}

export type PosterResult =
  | { ok: true; at: number | null; note: string }
  | { ok: false; error: string };

/**
 * Einzelbild aus einem Video.
 *
 * `-ss` steht VOR `-i`, ist also ein Input-Seek und damit auch über ein
 * Netzlaufwerk schnell. Der Filter `thumbnail=100` wählt aus je hundert
 * Bildern das nach ffmpegs Histogramm-Heuristik aussagekräftigste — er
 * überspringt gleichförmige Schwarz- und Weißbilder von sich aus.
 *
 * Danach wird trotzdem geprüft: ist das Ergebnis doch schwarz, wird es an
 * einer späteren Stelle erneut versucht.
 */
export async function makeVideoPoster(
  media: string,
  targetDir: string,
  durationSec: number | null,
  tools: FfmpegTools,
  atSec?: number | null,
): Promise<PosterResult> {
  const target = path.join(targetDir, ITEM_FILES.poster);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "mediathek-poster-"));

  // Bei bekannter Dauer 5 %, dann 25 %, dann 50 %. Ohne Dauer bei 3 Sekunden.
  const offsets: number[] =
    atSec != null && atSec >= 0
      ? [atSec]
      : durationSec && durationSec > 0
        ? [durationSec * 0.05, durationSec * 0.25, durationSec * 0.5]
        : [3, 0];

  try {
    let lastFile: string | null = null;
    for (const [index, offset] of offsets.entries()) {
      const candidate = path.join(work, `poster-${index}.jpg`);
      const window = durationSec
        ? Math.max(5, Math.min(60, durationSec * 0.5))
        : 10;

      const result = await run(tools.ffmpeg, [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        offset.toFixed(2),
        "-t",
        window.toFixed(2),
        "-i",
        media,
        "-vf",
        "thumbnail=100,scale=1280:-2:flags=lanczos",
        "-frames:v",
        "1",
        "-q:v",
        "3",
        "-f",
        "image2",
        candidate,
      ]);

      if (!result.ok) continue;
      try {
        const info = await fs.stat(candidate);
        if (info.size === 0) continue;
      } catch {
        continue;
      }
      lastFile = candidate;

      // Bei einer ausdrücklich gewählten Stelle nicht widersprechen.
      if (atSec != null) break;

      const luma = await brightness(candidate, tools);
      if (luma === null || (luma >= MIN_BRIGHTNESS && luma <= MAX_BRIGHTNESS)) {
        await moveIntoPlace(candidate, target);
        return {
          ok: true,
          at: Math.round(offset),
          note: `Kachelbild bei ${Math.round(offset)} s.`,
        };
      }
    }

    if (lastFile) {
      // Alle Versuche waren gleichförmig — dann eben das letzte Bild.
      await moveIntoPlace(lastFile, target);
      return {
        ok: true,
        at: null,
        note: "Kachelbild erzeugt; das Video ist an allen Prüfstellen gleichförmig.",
      };
    }
    return { ok: false, error: "Es ließ sich kein Einzelbild gewinnen." };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Wellenform als Kachelbild für Sprachmemos.
 *
 * Billig — ffmpeg liest die Datei einmal durch und zeichnet — und
 * aussagekräftig: man sieht auf einen Blick, wo gesprochen wird und wo
 * Pausen sind.
 */
export async function makeAudioPoster(
  media: string,
  targetDir: string,
  tools: FfmpegTools,
): Promise<PosterResult> {
  const target = path.join(targetDir, ITEM_FILES.poster);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "mediathek-poster-"));
  const candidate = path.join(work, "welle.jpg");

  try {
    const result = await run(tools.ffmpeg, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      media,
      "-filter_complex",
      // 16:9 wie die Kacheln, in der Akzentfarbe der Oberfläche.
      "showwavespic=s=1280x720:colors=0x308964:scale=sqrt,format=yuv420p",
      "-frames:v",
      "1",
      "-q:v",
      "4",
      "-f",
      "image2",
      candidate,
    ]);

    if (!result.ok) {
      return {
        ok: false,
        error: `Die Wellenform ließ sich nicht zeichnen: ${result.stderr.trim().slice(-300)}`,
      };
    }
    const info = await fs.stat(candidate).catch(() => null);
    if (!info || info.size === 0) {
      return { ok: false, error: "Die Wellenform blieb leer." };
    }

    await moveIntoPlace(candidate, target);
    return { ok: true, at: null, note: "Wellenform als Kachelbild erzeugt." };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
