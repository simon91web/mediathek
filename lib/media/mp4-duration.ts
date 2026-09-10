import { open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";

/*
 * Dauer und Faststart-Zustand aus einer MP4-Familie-Datei lesen, ohne ffmpeg
 * und ohne Abhängigkeit — es werden nur die Atom-Köpfe gelesen, nie
 * Nutzdaten. Über SMB sind das eine Handvoll Roundtrips statt eines
 * vollständigen Lesevorgangs.
 *
 * Deckt mp4, m4v, m4a und mov ab; alles andere (webm, mkv, mp3, wav) liefert
 * null, und dann bleibt die Dauer eben unbekannt, bis ffprobe (Etappe 2) oder
 * der Player sie nennt.
 */

/** Ein Atom-Kopf: 4 Byte Größe, 4 Byte Typ, optional 8 Byte 64-Bit-Größe. */
type AtomHeader = {
  type: string;
  /** Offset des Atoms selbst. */
  offset: number;
  /** Länge des Kopfes (8 oder 16). */
  headerSize: number;
  /** Gesamtlänge inklusive Kopf; null heißt "bis zum Dateiende". */
  size: number | null;
};

async function readHeader(
  handle: FileHandle,
  offset: number,
  fileSize: number,
): Promise<AtomHeader | null> {
  if (offset + 8 > fileSize) return null;
  const buffer = Buffer.alloc(16);
  const { bytesRead } = await handle.read(buffer, 0, 16, offset);
  if (bytesRead < 8) return null;

  const type = buffer.toString("latin1", 4, 8);
  if (!/^[\x20-\x7e]{4}$/.test(type)) return null;

  const short = buffer.readUInt32BE(0);
  if (short === 1) {
    if (bytesRead < 16) return null;
    const big = buffer.readBigUInt64BE(8);
    if (big < 16n || big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return { type, offset, headerSize: 16, size: Number(big) };
  }
  if (short === 0) {
    // Läuft bis zum Dateiende.
    return { type, offset, headerSize: 8, size: null };
  }
  if (short < 8) return null;
  return { type, offset, headerSize: 8, size: short };
}

/** Läuft die Atome einer Ebene ab. */
async function* walkAtoms(
  handle: FileHandle,
  from: number,
  to: number,
  fileSize: number,
): AsyncGenerator<AtomHeader> {
  let offset = from;
  // Harte Obergrenze gegen kaputte Dateien mit Größe 8.
  for (let guard = 0; guard < 4096; guard += 1) {
    if (offset >= to) return;
    const header = await readHeader(handle, offset, fileSize);
    if (!header) return;
    yield header;
    const size = header.size ?? to - offset;
    if (size <= 0) return;
    offset += size;
  }
}

async function readMvhdDuration(
  handle: FileHandle,
  moov: AtomHeader,
  fileSize: number,
): Promise<number | null> {
  const end = moov.size === null ? fileSize : moov.offset + moov.size;
  for await (const child of walkAtoms(
    handle,
    moov.offset + moov.headerSize,
    end,
    fileSize,
  )) {
    if (child.type !== "mvhd") continue;

    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(
      buffer,
      0,
      32,
      child.offset + child.headerSize,
    );
    if (bytesRead < 20) return null;

    const version = buffer.readUInt8(0);
    if (version === 1) {
      if (bytesRead < 28) return null;
      // 4 Byte Version/Flags, 8 Byte Erstellung, 8 Byte Änderung.
      const timescale = buffer.readUInt32BE(20);
      const duration = buffer.readBigUInt64BE(24);
      if (!timescale) return null;
      return Number(duration) / timescale;
    }

    // Version 0: 4 Byte Version/Flags, 4 Byte Erstellung, 4 Byte Änderung.
    const timescale = buffer.readUInt32BE(12);
    const duration = buffer.readUInt32BE(16);
    if (!timescale) return null;
    /*
     * 0xffffffff heißt bei manchen Aufnahmegeräten "unbekannt". Lieber null
     * melden als eine Dauer von 136 Jahren anzeigen.
     */
    if (duration === 0xffffffff) return null;
    return duration / timescale;
  }
  return null;
}

export type Mp4Info = {
  durationSeconds: number | null;
  /**
   * true, wenn das moov-Atom vor dem mdat liegt. Andernfalls muss der Browser
   * vor dem Start das Dateiende holen — über SMB bei mehreren Gigabyte sind
   * das sichtbare Sekunden.
   */
  faststart: boolean | null;
};

/**
 * Liest Dauer und Faststart-Zustand. Wirft nie: eine unlesbare oder fremde
 * Datei liefert null, und der Beitrag bleibt trotzdem abspielbar.
 */
export async function readMp4Info(file: string): Promise<Mp4Info> {
  let handle: FileHandle | null = null;
  try {
    handle = await open(file, "r");
    const stat = await handle.stat();
    const fileSize = stat.size;
    if (fileSize < 16) return { durationSeconds: null, faststart: null };

    let durationSeconds: number | null = null;
    let sawMdat = false;
    let faststart: boolean | null = null;

    for await (const atom of walkAtoms(handle, 0, fileSize, fileSize)) {
      if (atom.type === "mdat") {
        sawMdat = true;
        continue;
      }
      if (atom.type === "moov") {
        faststart = !sawMdat;
        durationSeconds = await readMvhdDuration(handle, atom, fileSize);
        // Nach dem moov gibt es nichts mehr, was wir brauchen.
        break;
      }
    }

    const usable =
      durationSeconds !== null &&
      Number.isFinite(durationSeconds) &&
      durationSeconds > 0
        ? Math.round(durationSeconds)
        : null;

    return { durationSeconds: usable, faststart };
  } catch {
    return { durationSeconds: null, faststart: null };
  } finally {
    await handle?.close().catch(() => {});
  }
}
