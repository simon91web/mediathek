/*
 * Das Programmsymbol: grünes Quadrat, weißes M — dasselbe Zeichen wie in der
 * Kopfzeile der App.
 *
 * Von Hand gezeichnet und von Hand als ICO (Windows) bzw. PNG+iconutil/icns
 * (macOS) geschrieben, ohne Zusatzpaket. Das klingt nach Selbstzweck, ist
 * aber die billigste Lösung: eine Bilderbibliothek nur fürs Symbol wäre eine
 * Abhängigkeit mehr im Bau eines Programms, dessen ganzer Witz ist, keine
 * zu haben.
 *
 * ICO ist schlicht: ein Verzeichnis, dann je Größe eine BMP ohne Dateikopf.
 * Zwei Eigenheiten, an denen man sonst scheitert:
 *
 *   - Die Höhe im BITMAPINFOHEADER ist DOPPELT so groß wie das Bild. Das
 *     Format erwartet darunter noch eine Maske, auch wenn die Farbtiefe schon
 *     einen Alphakanal hat.
 *   - Die Zeilen stehen von UNTEN nach OBEN.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const AKZENT = { r: 0x30, g: 0x89, b: 0x64 };

/** Ein Bild als BGRA-Feld. */
function zeichnen(groesse) {
  const px = new Uint8Array(groesse * groesse * 4);
  const radius = Math.round(groesse * 0.22);

  const setzen = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= groesse || y >= groesse) return;
    const i = (y * groesse + x) * 4;
    px[i] = b;
    px[i + 1] = g;
    px[i + 2] = r;
    px[i + 3] = 255;
  };

  // Abgerundetes Quadrat in der Akzentfarbe.
  for (let y = 0; y < groesse; y += 1) {
    for (let x = 0; x < groesse; x += 1) {
      const dx = Math.min(x, groesse - 1 - x);
      const dy = Math.min(y, groesse - 1 - y);
      if (dx < radius && dy < radius) {
        const abstand = Math.hypot(radius - dx, radius - dy);
        if (abstand > radius + 0.5) continue;
      }
      setzen(x, y, AKZENT.r, AKZENT.g, AKZENT.b);
    }
  }

  /*
   * Das M aus vier Strichen. Bei 16 Pixeln bleibt davon wenig übrig — deshalb
   * wird der Strich dort ausdrücklich dicker gehalten, sonst verschwindet der
   * Buchstabe in der Taskleiste zu einem grauen Fleck.
   */
  const dick = Math.max(2, Math.round(groesse * (groesse <= 16 ? 0.13 : 0.1)));
  const oben = Math.round(groesse * 0.29);
  const unten = Math.round(groesse * 0.71);
  const links = Math.round(groesse * 0.27);
  const rechts = Math.round(groesse * 0.73);
  const tal = Math.round(groesse * 0.58);
  const mitte = Math.round(groesse * 0.5);

  const strich = (x0, y0, x1, y1) => {
    const schritte = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3));
    for (let s = 0; s <= schritte; s += 1) {
      const t = s / schritte;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      for (let oy = -dick / 2; oy <= dick / 2; oy += 0.4) {
        for (let ox = -dick / 2; ox <= dick / 2; ox += 0.4) {
          setzen(Math.round(cx + ox), Math.round(cy + oy), 255, 255, 255);
        }
      }
    }
  };

  strich(links, unten, links, oben);
  strich(links, oben, mitte, tal);
  strich(mitte, tal, rechts, oben);
  strich(rechts, oben, rechts, unten);

  return px;
}

/** Ein Bild als BMP-Block, wie ICO ihn erwartet. */
function bmp(px, groesse) {
  const kopf = Buffer.alloc(40);
  kopf.writeUInt32LE(40, 0);
  kopf.writeInt32LE(groesse, 4);
  // Doppelte Höhe: darunter steht die Maske.
  kopf.writeInt32LE(groesse * 2, 8);
  kopf.writeUInt16LE(1, 12);
  kopf.writeUInt16LE(32, 14);

  const farben = Buffer.alloc(groesse * groesse * 4);
  for (let y = 0; y < groesse; y += 1) {
    // Von unten nach oben.
    const quelle = (groesse - 1 - y) * groesse * 4;
    px.slice(quelle, quelle + groesse * 4).forEach((wert, i) => {
      farben[y * groesse * 4 + i] = wert;
    });
  }

  // Die Maske: alles sichtbar. Jede Zeile auf vier Byte aufgefüllt.
  const maskenZeile = Math.ceil(groesse / 32) * 4;
  const maske = Buffer.alloc(maskenZeile * groesse);

  return Buffer.concat([kopf, farben, maske]);
}

/** Ein ICO mit mehreren Größen. */
export function buildIcon(groessen = [16, 32, 48, 64, 128]) {
  const bilder = groessen.map((groesse) => ({
    groesse,
    daten: bmp(zeichnen(groesse), groesse),
  }));

  const verzeichnis = Buffer.alloc(6 + bilder.length * 16);
  verzeichnis.writeUInt16LE(0, 0);
  verzeichnis.writeUInt16LE(1, 2);
  verzeichnis.writeUInt16LE(bilder.length, 4);

  let versatz = verzeichnis.length;
  bilder.forEach((bild, i) => {
    const pos = 6 + i * 16;
    // 256 wird als 0 geschrieben — ein Byte kann nicht mehr.
    verzeichnis.writeUInt8(bild.groesse >= 256 ? 0 : bild.groesse, pos);
    verzeichnis.writeUInt8(bild.groesse >= 256 ? 0 : bild.groesse, pos + 1);
    verzeichnis.writeUInt8(0, pos + 2);
    verzeichnis.writeUInt8(0, pos + 3);
    verzeichnis.writeUInt16LE(1, pos + 4);
    verzeichnis.writeUInt16LE(32, pos + 6);
    verzeichnis.writeUInt32LE(bild.daten.length, pos + 8);
    verzeichnis.writeUInt32LE(versatz, pos + 12);
    versatz += bild.daten.length;
  });

  return Buffer.concat([verzeichnis, ...bilder.map((bild) => bild.daten)]);
}

/** Ein Bild als PNG — fürs iconset, aus dem iconutil ein icns macht. */
function png(px, groesse) {
  const raw = Buffer.alloc((groesse * 4 + 1) * groesse);
  for (let y = 0; y < groesse; y += 1) {
    const zeile = y * (groesse * 4 + 1);
    raw[zeile] = 0; // Filter None
    for (let x = 0; x < groesse; x += 1) {
      const i = (y * groesse + x) * 4;
      const o = zeile + 1 + x * 4;
      raw[o] = px[i + 2];
      raw[o + 1] = px[i + 1];
      raw[o + 2] = px[i];
      raw[o + 3] = px[i + 3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(groesse, 0);
  ihdr.writeUInt32BE(groesse, 4);
  ihdr[8] = 8; // Bit-Tiefe
  ihdr[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(typ, daten) {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const typBuf = Buffer.from(typ);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([typBuf, daten])) >>> 0);
  return Buffer.concat([laenge, typBuf, daten, crc]);
}

/**
 * Schreibt ein .icns über Apples iconutil. Nur unter macOS.
 *
 * Die Pixel kommen aus derselben Zeichenfunktion wie das ICO, damit das
 * Symbol auf beiden Systemen dasselbe ist.
 */
export function buildIcns(ziel) {
  if (process.platform !== "darwin") {
    throw new Error("iconutil — und damit .icns — gibt es nur unter macOS.");
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mediathek-iconset-"));
  const iconset = path.join(tmp, "mediathek.iconset");
  fs.mkdirSync(iconset);

  const stufen = [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ];

  try {
    for (const [name, groesse] of stufen) {
      fs.writeFileSync(path.join(iconset, name), png(zeichnen(groesse), groesse));
    }
    const lauf = spawnSync("iconutil", ["-c", "icns", iconset, "-o", ziel], {
      encoding: "utf8",
    });
    if (lauf.status !== 0) {
      throw new Error(
        `iconutil ist fehlgeschlagen: ${(lauf.stderr || lauf.stdout || "").trim()}`,
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
