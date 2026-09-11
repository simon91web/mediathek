import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readMp4Info } from "./mp4-duration";

/*
 * Die Kürzungserkennung.
 *
 * Sie stammt aus einem echten Datenverlust: ein stiller Größenschnitt beim
 * Upload hinterließ Videos, die scheinbar in Ordnung waren — Dauer und
 * Kachelbild stimmten, weil das moov-Atom am Anfang lag, nur abspielen ließ
 * sich nichts. Die Dauer taugt deshalb NICHT als Kriterium; das Kriterium
 * ist die Atomkette: beansprucht ein Atom mehr Bytes, als die Datei hat,
 * fehlt das Ende.
 *
 * Für diese Prüfung braucht es keine gültige MP4-Datei, nur gültige
 * Atom-Köpfe — genau die liest readMp4Info.
 */

/** Ein Atom-Kopf: 4 Byte Größe, 4 Byte Typ. */
function atom(type: string, size: number, payload = 0): Buffer {
  const head = Buffer.alloc(8 + payload);
  head.writeUInt32BE(size, 0);
  head.write(type, 4, "latin1");
  return head;
}

let dir: string;

async function schreibe(name: string, teile: Buffer[]): Promise<string> {
  const file = path.join(dir, name);
  await fs.writeFile(file, Buffer.concat(teile));
  return file;
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mediathek-mp4-"));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("readMp4Info: truncated", () => {
  it("erkennt ein Atom, das über das Dateiende hinausreicht", async () => {
    /*
     * Genau der Schadensfall: ftyp und moov sind vollständig, das mdat
     * kündigt eine halbe Million Bytes an, und die Datei endet vorher.
     */
    const file = await schreibe("abgeschnitten.mp4", [
      atom("ftyp", 32, 24),
      atom("moov", 64, 56),
      atom("mdat", 500_000),
      Buffer.alloc(200),
    ]);

    const info = await readMp4Info(file);
    expect(info.truncated).toBe(true);
  });

  it("erkennt eine vollständige Datei als vollständig", async () => {
    const file = await schreibe("ganz.mp4", [
      atom("ftyp", 32, 24),
      atom("moov", 64, 56),
      atom("mdat", 208, 200),
    ]);

    const info = await readMp4Info(file);
    expect(info.truncated).toBe(false);
  });

  it('nimmt Größe null als "bis zum Dateiende" und nicht als Schnitt', async () => {
    // Beim letzten Atom ist das erlaubt und heißt genau das.
    const file = await schreibe("bis-ende.mp4", [
      atom("ftyp", 32, 24),
      atom("mdat", 0),
      Buffer.alloc(500),
    ]);

    const info = await readMp4Info(file);
    expect(info.truncated).toBe(false);
  });

  it("urteilt über ein fremdes Format nicht", async () => {
    /*
     * webm, mkv, mp3: dort gibt es keine Atome. Ein "unvollständig" wäre ein
     * Fehlalarm, und ein "vollständig" eine Behauptung ohne Grundlage —
     * deshalb null.
     */
    const file = await schreibe("fremd.mp4", [
      Buffer.from("Das ist kein MP4, nicht einmal ansatzweise.", "utf8"),
    ]);

    const info = await readMp4Info(file);
    expect(info.truncated).toBeNull();
  });

  it("urteilt über eine winzige Datei nicht", async () => {
    const file = await schreibe("winzig.mp4", [Buffer.alloc(4)]);
    const info = await readMp4Info(file);
    expect(info.truncated).toBeNull();
  });

  it("liest die Dauer weiterhin, wenn sie dasteht", async () => {
    /*
     * Gegenprobe, dass die Erweiterung den eigentlichen Zweck nicht
     * beschädigt hat: moov → mvhd mit Zeitskala und Dauer.
     *
     * mvhd Version 0: 4 Byte Flags/Version, 4 Byte Erzeugung, 4 Byte
     * Änderung, 4 Byte Zeitskala, 4 Byte Dauer.
     */
    const mvhd = Buffer.alloc(8 + 20);
    mvhd.writeUInt32BE(8 + 20, 0);
    mvhd.write("mvhd", 4, "latin1");
    mvhd.writeUInt32BE(0, 8); // Version 0
    mvhd.writeUInt32BE(0, 12);
    mvhd.writeUInt32BE(0, 16);
    mvhd.writeUInt32BE(1000, 20); // Zeitskala
    mvhd.writeUInt32BE(42_000, 24); // Dauer → 42 s

    const moov = atom("moov", 8 + mvhd.length);
    const file = await schreibe("mit-dauer.mp4", [
      atom("ftyp", 32, 24),
      moov,
      mvhd,
      atom("mdat", 108, 100),
    ]);

    const info = await readMp4Info(file);
    expect(info.durationSeconds).toBe(42);
    expect(info.faststart).toBe(true);
    expect(info.truncated).toBe(false);
  });
});
