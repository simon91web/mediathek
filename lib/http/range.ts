/*
 * HTTP-Range ohne Dateizugriff und ohne Next-Import — deshalb direkt
 * testbar. Ein Range-Fehler macht das Springen im Player kaputt, und zwar in
 * jedem Browser anders; das ist genau die Art Fehler, die eine Tabelle von
 * Unit-Tests billig findet und ein Klicktest teuer.
 */

export type RangeOutcome =
  /** Ganze Datei, Antwort 200. */
  | { kind: "voll"; start: 0; end: number; length: number }
  /** Ausschnitt, Antwort 206. */
  | { kind: "teil"; start: number; end: number; length: number }
  /** Antwort 416 mit Content-Range: bytes STERN/<size>. */
  | { kind: "unerfuellbar" };

function full(size: number): RangeOutcome {
  return { kind: "voll", start: 0, end: Math.max(0, size - 1), length: size };
}

/**
 * Wertet den Range-Kopf aus.
 *
 * Die Regeln der Reihe nach:
 *  1. Kein Range -> ganze Datei.
 *  2. Andere Einheit als bytes -> ganze Datei. Ein Server DARF Range
 *     ignorieren, aber dann niemals 206 antworten.
 *  3. Mehrfach-Ranges -> ganze Datei. multipart/byteranges bauen wir nicht,
 *     und Mediaplayer fragen das nicht an.
 *  4. "bytes=0-" -> 206 über die ganze Datei. Chrome schickt das als Erstes;
 *     antwortet man mit 200, funktioniert das Springen anschließend nicht
 *     mehr zuverlässig.
 *  5. Suffix "bytes=-500" muss gehen: so sucht QuickTime/Safari das
 *     moov-Atom am Dateiende.
 *  6. start >= size -> 416.
 *  7. end jenseits der Datei wird geklemmt, das ist kein Fehler.
 *  8. Unparsbares oder start > end -> ganze Datei.
 */
export function computeRange(
  rangeHeader: string | null | undefined,
  size: number,
): RangeOutcome {
  if (!rangeHeader) return full(size);

  const match = /^\s*bytes\s*=\s*(.+)$/i.exec(rangeHeader);
  if (!match) return full(size);

  const spec = match[1].trim();
  if (spec.includes(",")) return full(size);

  const parts = /^(\d*)\s*-\s*(\d*)$/.exec(spec);
  if (!parts) return full(size);

  const [, fromText, toText] = parts;

  // Suffix-Range: die letzten N Bytes.
  if (fromText === "") {
    if (toText === "") return full(size);
    const wanted = Number(toText);
    if (!Number.isFinite(wanted)) return full(size);
    // "bytes=-0" verlangt die letzten null Bytes — nicht erfüllbar.
    if (wanted === 0) return { kind: "unerfuellbar" };
    if (size === 0) return { kind: "unerfuellbar" };
    const start = Math.max(0, size - wanted);
    return { kind: "teil", start, end: size - 1, length: size - start };
  }

  const start = Number(fromText);
  if (!Number.isFinite(start)) return full(size);
  if (size === 0) return { kind: "unerfuellbar" };
  if (start >= size) return { kind: "unerfuellbar" };

  if (toText === "") {
    return { kind: "teil", start, end: size - 1, length: size - start };
  }

  const requestedEnd = Number(toText);
  if (!Number.isFinite(requestedEnd)) return full(size);
  if (requestedEnd < start) return full(size);
  const end = Math.min(requestedEnd, size - 1);
  return { kind: "teil", start, end, length: end - start + 1 };
}

/**
 * Schwaches ETag aus Größe und Zeitstempel. Schwach, weil es den Inhalt nicht
 * prüft — für eine lokale Mediathek genau die richtige Abwägung.
 */
export function makeWeakEtag(size: number, mtimeMs: number): string {
  return `W/"${size.toString(16)}-${Math.round(mtimeMs).toString(16)}"`;
}

/**
 * Prüft If-Range. Passt der Wert nicht, muss die ganze Datei mit 200 kommen.
 *
 * Genau das übersehen die meisten Eigenbauten — und dann setzt ein Player
 * nach einem Dateiwechsel zwei Hälften aus verschiedenen Dateien zusammen.
 */
export function ifRangeMatches(
  header: string | null | undefined,
  etag: string,
  lastModified: Date,
): boolean {
  if (!header) return true;
  const value = header.trim();
  if (value.startsWith("W/") || value.startsWith('"')) {
    // Ein schwaches ETag darf für If-Range streng genommen nicht verwendet
    // werden; wir vergleichen trotzdem, das ist die praktikable Auslegung.
    return value === etag || value === etag.replace(/^W\//, "");
  }
  const asDate = Date.parse(value);
  if (Number.isNaN(asDate)) return false;
  // Sekundengenau vergleichen: der Kopf trägt keine Millisekunden.
  return Math.floor(asDate / 1000) === Math.floor(lastModified.getTime() / 1000);
}
