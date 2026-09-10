import "server-only";

import fs from "node:fs/promises";

import { getItem } from "./index";
import type { Slug, Transcript, TranscriptSegment } from "./types";

/*
 * Transkripte stehen bewusst NICHT im Index: ein 90-Minuten-Beitrag hat
 * schnell tausend Segmente, und bei 500 Beiträgen wäre library.json
 * unbrauchbar groß. Gelesen wird erst, wenn jemand den Transkript-Tab öffnet
 * oder die Suche ein Snippet braucht.
 */

const MAX_CACHED = 20;

type CacheEntry = { mtimeMs: number; transcript: Transcript };

const globalForTranscripts = globalThis as unknown as {
  mediathekTranscripts?: Map<Slug, CacheEntry>;
};

const cache: Map<Slug, CacheEntry> = (globalForTranscripts.mediathekTranscripts ??=
  new Map());

function toSegments(raw: unknown): TranscriptSegment[] {
  if (!Array.isArray(raw)) return [];
  const segments: TranscriptSegment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const start = Number(record.start);
    const end = Number(record.end ?? record.start);
    const text = String(record.text ?? "").trim();
    if (!Number.isFinite(start) || !text) continue;
    segments.push({
      start,
      end: Number.isFinite(end) && end > start ? end : start,
      text,
    });
  }
  segments.sort((a, b) => a.start - b.start);
  return segments;
}

/**
 * Liest transcript.json. Wirft nie — eine kaputte oder halb geschriebene
 * Datei führt zu null, und der Beitrag bleibt ohne Transkript-Tab benutzbar.
 *
 * Akzeptiert das Objekt-Format des Transkriptionsskripts und, aus Toleranz,
 * auch ein nacktes Array von Segmenten.
 */
export async function getTranscript(slug: string): Promise<Transcript | null> {
  const item = await getItem(slug);
  const file = item?.assets.transcriptJsonFile;
  if (!file) return null;

  let mtimeMs = 0;
  try {
    const info = await fs.stat(file);
    mtimeMs = Math.round(info.mtimeMs);
  } catch {
    return null;
  }

  const cached = cache.get(slug);
  if (cached && cached.mtimeMs === mtimeMs) {
    // Bei einem Treffer nach hinten schieben, damit die LRU-Ordnung stimmt.
    cache.delete(slug);
    cache.set(slug, cached);
    return cached.transcript;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }

  const source = Array.isArray(parsed)
    ? { segments: parsed }
    : ((parsed ?? {}) as Record<string, unknown>);

  const segments = toSegments(source.segments);
  if (segments.length === 0) return null;

  const duration = Number(source.duration_sec ?? source.durationSeconds);
  const transcript: Transcript = {
    segments,
    model: typeof source.model === "string" ? source.model : null,
    language: typeof source.language === "string" ? source.language : null,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
  };

  cache.set(slug, { mtimeMs, transcript });
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }

  return transcript;
}

/** Wird beim Neu-Einlesen gerufen, damit ein neues Transkript sofort greift. */
export function invalidateTranscripts(slugs?: readonly Slug[]): void {
  if (!slugs) {
    cache.clear();
    return;
  }
  for (const slug of slugs) cache.delete(slug);
}

/** Das Segment, in dem die Zeit liegt — für "genau hier springen". */
export function segmentAt(
  transcript: Transcript,
  seconds: number,
): TranscriptSegment | null {
  let low = 0;
  let high = transcript.segments.length - 1;
  let found: TranscriptSegment | null = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const segment = transcript.segments[mid];
    if (segment.start <= seconds) {
      found = segment;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
