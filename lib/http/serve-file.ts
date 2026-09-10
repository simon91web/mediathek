import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";

import { computeRange, ifRangeMatches, makeWeakEtag } from "./range";

/*
 * Eine Datei aus der Bibliothek ausliefern — mit Range, damit das Springen im
 * Player funktioniert, und ohne die Datei je zu puffern.
 */

/**
 * 1 MiB statt der Standard-64 KiB. Über SMB ist das der größte
 * Einzelgewinn: die Roundtrip-Latenz dominiert, und 64-KiB-Lesevorgänge
 * bleiben über Gigabit deutlich unter Leitungsgeschwindigkeit.
 */
const HIGH_WATER_MARK = 1 << 20;

export type ServeFileOptions = {
  file: string;
  mime: string;
  /** Dateiname für "Speichern unter"; ohne das bleibt es inline. */
  downloadName?: string;
  /** Medien und Kachelbilder dürfen lange gecacht werden. */
  immutable?: boolean;
};

export async function serveFile(
  request: Request,
  options: ServeFileOptions,
): Promise<Response> {
  let size: number;
  let mtime: Date;
  try {
    const info = await fs.stat(options.file);
    if (!info.isFile()) return new Response("Nicht gefunden", { status: 404 });
    size = info.size;
    mtime = info.mtime;
  } catch {
    return new Response("Nicht gefunden", { status: 404 });
  }

  const etag = makeWeakEtag(size, mtime.getTime());
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": options.mime,
    ETag: etag,
    "Last-Modified": mtime.toUTCString(),
    "Cache-Control": options.immutable
      ? // Der Zeitstempel steckt im ETag; ein zweites Ansehen soll die Datei
        // nicht erneut über das Netzlaufwerk ziehen.
        "private, max-age=31536000, immutable"
      : "private, max-age=0, must-revalidate",
    "Content-Disposition": options.downloadName
      ? `attachment; filename*=UTF-8''${encodeURIComponent(options.downloadName)}`
      : "inline",
  });

  // Unveränderte Datei: der Browser hat sie schon.
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  const rangeHeader = ifRangeMatches(
    request.headers.get("if-range"),
    etag,
    mtime,
  )
    ? request.headers.get("range")
    : // If-Range passt nicht: die ganze Datei ausliefern, sonst klebt der
      // Player zwei Hälften verschiedener Dateien zusammen.
      null;

  const outcome = computeRange(rangeHeader, size);

  if (outcome.kind === "unerfuellbar") {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }

  const status = outcome.kind === "teil" && rangeHeader ? 206 : 200;
  headers.set("Content-Length", String(outcome.length));
  if (status === 206) {
    headers.set(
      "Content-Range",
      `bytes ${outcome.start}-${outcome.end}/${size}`,
    );
  }

  // HEAD beantwortet dieselben Köpfe, nur ohne Rumpf. Chrome schickt eines.
  if (request.method === "HEAD") {
    return new Response(null, { status, headers });
  }

  if (outcome.length === 0) {
    return new Response(null, { status, headers });
  }

  const node = createReadStream(options.file, {
    start: outcome.start,
    end: outcome.end,
    highWaterMark: HIGH_WATER_MARK,
  });

  /*
   * Bei jedem Sprung bricht der Player die laufende Anfrage ab. Ohne diesen
   * Handler steht dann bei jedem Klick auf die Zeitleiste ein Stacktrace im
   * Terminal — kein Fehler, nur Lärm, der echte Fehler unsichtbar macht.
   */
  node.on("error", (error) => {
    const code = (error as NodeJS.ErrnoException).code;
    const harmless = [
      "ERR_STREAM_PREMATURE_CLOSE",
      "EPIPE",
      "ECONNRESET",
      "ECANCELED",
    ];
    if (!harmless.includes(String(code))) {
      console.error(`[medien] Lesefehler in ${options.file}:`, error);
    }
  });

  /*
   * Der verlässliche Weg, den Dateizeiger loszuwerden: Next reicht das
   * Abbrechen der Antwort nicht immer an den Web-Stream durch. Ohne das
   * sammelt der Prozess bei häufigem Spulen offene Dateihandles — auf einem
   * Netzlaufwerk besonders unangenehm.
   */
  request.signal.addEventListener("abort", () => node.destroy(), {
    once: true,
  });

  const body = Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>;
  return new Response(body, { status, headers });
}
