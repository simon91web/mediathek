import "server-only";

import { spawn } from "node:child_process";

import type { FfmpegTools } from "./locate";

/*
 * Was in einer Mediendatei steckt — und ob ein Browser sie abspielen kann.
 *
 * Der wichtigste Fall in der Praxis: H.265/HEVC aus Handy oder Drohne.
 * Chrome und Edge spielen das nicht ohne Zusatz, und ohne diese Prüfung
 * sitzt der Kollege ratlos vor einem schwarzen Player.
 */

export type PlayabilityVerdict =
  | { ok: true }
  | { ok: "warnung"; reason: string; detail: string }
  | { ok: false; reason: string; detail: string; suggestion: "webfassung" | "keine" };

export type MediaInfo = {
  durationSec: number | null;
  sizeBytes: number | null;
  video: {
    codec: string;
    profile: string | null;
    width: number;
    height: number;
    fps: number | null;
    pixFmt: string | null;
  } | null;
  audio: {
    codec: string;
    channels: number | null;
    sampleRate: number | null;
    language: string | null;
  } | null;
  playability: PlayabilityVerdict;
};

type Stream = {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  pix_fmt?: string;
  channels?: number;
  sample_rate?: string;
  duration?: string;
  tags?: Record<string, string>;
};

function runJson(
  command: string,
  args: string[],
  timeoutMs = 60_000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
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

function parseFps(raw: string | undefined): number | null {
  if (!raw) return null;
  const [num, den] = raw.split("/").map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return Math.round((num / den) * 100) / 100;
}

/** Codecs, die Chrome und Edge unmittelbar abspielen. */
const OK_VIDEO = new Set(["h264", "vp8", "vp9"]);
const OK_AUDIO = new Set(["aac", "mp3", "opus", "vorbis", "flac", "pcm_s16le"]);

function judge(
  video: MediaInfo["video"],
  audio: MediaInfo["audio"],
): PlayabilityVerdict {
  if (video) {
    if (video.codec === "hevc" || video.codec === "h265") {
      return {
        ok: false,
        reason: "hevc",
        detail:
          "Das Video ist in H.265/HEVC kodiert. Chrome und Edge spielen das " +
          "nicht ohne Zusatz ab — typisch bei Aufnahmen aus Handy oder Drohne.",
        suggestion: "webfassung",
      };
    }
    if (["prores", "dnxhd", "mjpeg", "rawvideo"].includes(video.codec)) {
      return {
        ok: false,
        reason: "schnittformat",
        detail:
          `Das Format ${video.codec} ist ein Schnittformat und im Browser ` +
          "nicht abspielbar.",
        suggestion: "webfassung",
      };
    }
    if (video.pixFmt && /p10|p12|10le|12le/.test(video.pixFmt)) {
      return {
        ok: false,
        reason: "10bit",
        detail:
          `Die Farbtiefe (${video.pixFmt}) spielt der Browser nicht ab. ` +
          "Eine Web-Fassung in 8 Bit schafft Abhilfe.",
        suggestion: "webfassung",
      };
    }
    if (video.codec === "av1") {
      return {
        ok: "warnung",
        reason: "av1",
        detail:
          "AV1 dekodiert Chrome in Software. Auf einem älteren Notebook kann " +
          "das ruckeln.",
      };
    }
    if (!OK_VIDEO.has(video.codec)) {
      return {
        ok: false,
        reason: "unbekannt",
        detail: `Der Videocodec ${video.codec} ist im Browser nicht gesichert abspielbar.`,
        suggestion: "webfassung",
      };
    }
  }

  if (audio && !OK_AUDIO.has(audio.codec)) {
    return {
      ok: false,
      reason: "tonspur",
      detail:
        `Die Tonspur (${audio.codec}) spielt der Browser nicht ab. ` +
        (video
          ? "Eine Web-Fassung mit AAC-Ton schafft Abhilfe."
          : "Eine Umwandlung nach AAC oder Opus schafft Abhilfe."),
      suggestion: "webfassung",
    };
  }

  return { ok: true };
}

/**
 * Liest die Datei mit einem ffprobe-Aufruf aus. Wirft nie — eine unlesbare
 * Datei liefert leere Angaben, und der Beitrag bleibt in der Mediathek.
 */
export async function probeMedia(
  file: string,
  tools: FfmpegTools,
): Promise<MediaInfo> {
  const empty: MediaInfo = {
    durationSec: null,
    sizeBytes: null,
    video: null,
    audio: null,
    playability: { ok: true },
  };

  const result = await runJson(tools.ffprobe, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  if (!result.ok) return empty;

  let data: { format?: Record<string, string>; streams?: Stream[] };
  try {
    data = JSON.parse(result.stdout);
  } catch {
    return empty;
  }

  const streams = data.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === "video");
  const audioStream = streams.find((s) => s.codec_type === "audio");

  /*
   * Die Dauer aus format.duration fehlt oder lügt bei manchen Handy-Dateien
   * mit beschädigtem mvhd-Atom. Dann zählt die Dauer des Videostroms.
   */
  let durationSec: number | null = null;
  for (const raw of [data.format?.duration, videoStream?.duration, audioStream?.duration]) {
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) {
      durationSec = Math.round(value * 100) / 100;
      break;
    }
  }

  const video = videoStream
    ? {
        codec: videoStream.codec_name ?? "unbekannt",
        profile: videoStream.profile ?? null,
        width: videoStream.width ?? 0,
        height: videoStream.height ?? 0,
        fps: parseFps(videoStream.r_frame_rate),
        pixFmt: videoStream.pix_fmt ?? null,
      }
    : null;

  const audio = audioStream
    ? {
        codec: audioStream.codec_name ?? "unbekannt",
        channels: audioStream.channels ?? null,
        sampleRate: Number(audioStream.sample_rate) || null,
        language: audioStream.tags?.language ?? null,
      }
    : null;

  const size = Number(data.format?.size);

  return {
    durationSec,
    sizeBytes: Number.isFinite(size) ? size : null,
    video,
    audio,
    playability: judge(video, audio),
  };
}
