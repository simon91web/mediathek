import path from "node:path";

import type { AttachmentPreview, MediaKind } from "./types";

/*
 * Die Art eines Beitrags wird aus der vorhandenen Datei abgeleitet, nicht
 * verwaltet. Wer eine mp3 in einen Ordner legt, hat ein Sprachmemo; wer nur
 * beitrag.md hinlegt, hat einen Text. Das Frontmatter-Feld "art" kann das
 * überstimmen, ist aber der Notfall, nicht der Regelweg.
 */

/** Endung → MIME. Nur was ein Browser auch abspielen kann, plus Container, die wir erkennen wollen. */
export const VIDEO_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
};

export const AUDIO_MIME: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
};

export const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

/**
 * Formate, die Chrome und Edge unmittelbar abspielen. Alles andere wird
 * eingelesen und angezeigt, aber beim Import als "Umwandlung nötig" markiert
 * — HEVC in einer .mov aus dem Handy ist der Regelfall, nicht die Ausnahme.
 */
export const DIRECTLY_PLAYABLE = new Set([
  ".mp4",
  ".m4v",
  ".webm",
  ".m4a",
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".opus",
  ".flac",
]);

export function isVideoFile(name: string): boolean {
  return path.extname(name).toLowerCase() in VIDEO_MIME;
}

export function isAudioFile(name: string): boolean {
  return path.extname(name).toLowerCase() in AUDIO_MIME;
}

export function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(name).toLowerCase());
}

export function isMediaFile(name: string): boolean {
  return isVideoFile(name) || isAudioFile(name);
}

export function mediaMime(name: string): string | null {
  const ext = path.extname(name).toLowerCase();
  return VIDEO_MIME[ext] ?? AUDIO_MIME[ext] ?? null;
}

export function isDirectlyPlayable(name: string): boolean {
  return DIRECTLY_PLAYABLE.has(path.extname(name).toLowerCase());
}

/**
 * Wählt aus den Dateien eines Beitragsordners die Mediendatei.
 *
 * Bevorzugt werden die kanonischen Namen video.* und audio.*, die der Import
 * anlegt. Ein von Hand angelegter Ordner mit "vortrag.mp4" funktioniert
 * trotzdem — Toleranz kostet hier nichts und erspart Support.
 */
export function pickMediaFile(names: readonly string[]): {
  name: string;
  kind: Exclude<MediaKind, "text">;
} | null {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, "de"));

  const canonicalVideo = sorted.find(
    (name) => path.parse(name).name.toLowerCase() === "video" && isVideoFile(name),
  );
  if (canonicalVideo) return { name: canonicalVideo, kind: "video" };

  const canonicalAudio = sorted.find(
    (name) => path.parse(name).name.toLowerCase() === "audio" && isAudioFile(name),
  );
  if (canonicalAudio) return { name: canonicalAudio, kind: "audio" };

  const anyVideo = sorted.find(isVideoFile);
  if (anyVideo) return { name: anyVideo, kind: "video" };

  const anyAudio = sorted.find(isAudioFile);
  if (anyAudio) return { name: anyAudio, kind: "audio" };

  return null;
}

/** Anhänge: was der Browser direkt zeigen kann. */
export function attachmentPreview(name: string): AttachmentPreview {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"].includes(ext)) {
    return "bild";
  }
  return "keine";
}

const ATTACHMENT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json",
  ".zip": "application/zip",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".doc": "application/msword",
  ".xls": "application/vnd.ms-excel",
  ".ppt": "application/vnd.ms-powerpoint",
};

export function attachmentMime(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return (
    ATTACHMENT_MIME[ext] ??
    VIDEO_MIME[ext] ??
    AUDIO_MIME[ext] ??
    "application/octet-stream"
  );
}

/** "Bytes" in etwas, das man einem Menschen zeigen kann. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace(".", ",")} ${units[unit]}`;
}
