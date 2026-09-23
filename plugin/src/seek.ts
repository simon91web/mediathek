/**
 * Dieselbe Zeit-Grammatik wie `lib/library/chapters.ts`: mm:ss oder h:mm:ss,
 * Sekunden zweistellig. Hier nur die Überschrift, damit das Plugin den
 * Parser der App nicht mitprüft.
 */
const TIMECODE = /^(?:(\d{1,2}):(\d{2})|(\d{1,3})):([0-5]\d)$/;
const TIME_HEADING = /^#{2,3}\s+(\d{1,3}:\d{2}(?::\d{2})?)\s+(.+?)\s*$/;

function parseTimecode(raw: string): number | null {
  const match = TIMECODE.exec(raw.trim());
  if (!match) return null;
  const seconds = Number(match[4]);
  if (match[3] !== undefined) return Number(match[3]) * 60 + seconds;
  const minutes = Number(match[2]);
  if (minutes > 59) return null;
  return Number(match[1]) * 3600 + minutes * 60 + seconds;
}

/** Sekunden aus einer Kapitelüberschrift, im Editor mit oder ohne `#`. */
export function secondsInHeading(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const line = /^#{2,3}\s/.test(trimmed) ? trimmed : `### ${trimmed}`;
  const match = TIME_HEADING.exec(line);
  if (!match?.[1]) return null;
  const start = parseTimecode(match[1]);
  if (start === null || !match[2]?.trim()) return null;
  return start;
}

/** Die nächste Kapitelzeit nach `seconds`, oder null am letzten Kapitel. */
export function stopAfter(seconds: number, starts: readonly number[]): number | null {
  const later = starts.filter((start) => start > seconds).sort((a, b) => a - b);
  return later[0] ?? null;
}
