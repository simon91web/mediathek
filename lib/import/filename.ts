import path from "node:path";

import { isAudioFile, isTextFile, isVideoFile } from "@/lib/library/media-kind";
import { slugify } from "@/lib/library/slug";
import type { MediaKind, Slug } from "@/lib/library/types";

/*
 * Aus einem Dateinamen einen brauchbaren Titel, eine Kennung und ein Datum
 * gewinnen.
 *
 * Der Grund für den Aufwand: die Dateien kommen aus Kameras, Drohnen und
 * Diktiergeräten und heißen GX010042.MP4 oder DJI_0042.MOV. "Gx010042" als
 * Titel ist wertlos — besser bleibt das Feld dann leer und wird beim
 * Bearbeiten gefüllt.
 */

/** Muster, die reines Gerätekürzel sind und keinen Titel hergeben. */
const DEVICE_NOISE = [
  /^gx\d{6,}$/i, // GoPro
  /^gopr\d{4,}$/i,
  /^dji_?\d{3,}$/i, // DJI
  /^dji_\d{8}_\d{6}/i,
  /^c\d{4}$/i, // Sony
  /^mvi_?\d{3,}$/i, // Canon
  /^vid_?\d{6,}/i, // Android
  /^pxl_?\d{8}/i, // Pixel
  /^img_?\d{3,}$/i,
  /^mov_?\d{3,}$/i,
  /^video[-_ ]?\d*$/i,
  /^audio[-_ ]?\d*$/i,
  /^aufnahme[-_ ]?\d*$/i,
  /^recording[-_ ]?\d*$/i,
  /^neue?s?[-_ ]?aufnahme\d*$/i,
  /^\d{8}[-_]\d{6}$/, // 20260417_143012
  /^\d+$/, // nur Ziffern
];

function isDeviceNoise(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return DEVICE_NOISE.some((pattern) => pattern.test(trimmed));
}

export type FilenameInfo = {
  /** Vorschlag für den Titel; null, wenn der Name nichts hergibt. */
  title: string | null;
  slug: Slug;
  /** "YYYY-MM-DD", wenn im Namen ein Datum steckt. */
  recorded: string | null;
  /** Aus der Endung abgeleitet; null bei unbekannter Endung. */
  kind: MediaKind | null;
};

/**
 * Zieht ein führendes Datum heraus. Es landet im Frontmatter und NICHT in der
 * Kennung — sonst hieße jeder Beitrag "2026-04-17-…" und die Verweise wären
 * unlesbar.
 */
function extractDate(base: string): { rest: string; recorded: string | null } {
  const iso = /^(\d{4})[-_.](\d{2})[-_.](\d{2})[-_. ]*(.*)$/.exec(base);
  if (iso) {
    const [, year, month, day, rest] = iso;
    return { rest, recorded: `${year}-${month}-${day}` };
  }
  const german = /^(\d{2})[-_.](\d{2})[-_.](\d{4})[-_. ]*(.*)$/.exec(base);
  if (german) {
    const [, day, month, year, rest] = german;
    return { rest, recorded: `${year}-${month}-${day}` };
  }
  // 20260417 oder 20260417_143012
  const compact = /^(\d{4})(\d{2})(\d{2})(?:[-_]\d{6})?[-_. ]*(.*)$/.exec(base);
  if (compact) {
    const [, year, month, day, rest] = compact;
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    if (monthNumber >= 1 && monthNumber <= 12 && dayNumber >= 1 && dayNumber <= 31) {
      return { rest, recorded: `${year}-${month}-${day}` };
    }
  }
  return { rest: base, recorded: null };
}

/** Aus "vorflug_kontrolle-elios 3" wird "Vorflug kontrolle elios 3". */
function humanize(value: string): string {
  const words = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function parseMediaFilename(filename: string): FilenameInfo {
  const parsed = path.parse(filename);
  const base = parsed.name;

  const kind: MediaKind | null = isVideoFile(filename)
    ? "video"
    : isAudioFile(filename)
      ? "audio"
      : isTextFile(filename)
        ? "text"
        : null;

  const { rest, recorded } = extractDate(base);

  /*
   * Bleibt nach dem Datum nur Gerätekürzel übrig, gibt es keinen Titel. Ein
   * leeres Feld ist ehrlicher als "Gx010042" — und der Slug bleibt trotzdem
   * eindeutig.
   */
  const meaningful = rest.trim() && !isDeviceNoise(rest);
  const title = meaningful ? humanize(rest) : null;

  const slugSource = meaningful
    ? rest
    : recorded
      ? `${recorded}-${base}`
      : base;

  return {
    title,
    slug: slugify(slugSource),
    recorded,
    kind,
  };
}
