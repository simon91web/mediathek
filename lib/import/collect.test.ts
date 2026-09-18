import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { collectMediaFiles } from "./collect";

/*
 * Der Scan ist der geteilte Kern von "Ordner einlesen" (Import) und
 * "Sichten" — beide müssen dieselbe Datei, denselben Ordner und denselben
 * leeren Fall gleich behandeln.
 */

let temp: string;
let ordner: string;
let leer: string;
let versteckt: string;
let einzelVideo: string;
let einzelFremd: string;

beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "mediathek-scan-"));
  ordner = path.join(temp, "ordner");
  leer = path.join(temp, "leer");
  versteckt = path.join(ordner, ".git");
  einzelVideo = path.join(temp, "clip.mp4");
  einzelFremd = path.join(temp, "notizen.pdf");

  await fs.mkdir(path.join(ordner, "unterordner"), { recursive: true });
  await fs.mkdir(versteckt, { recursive: true });
  await fs.mkdir(leer);

  await fs.writeFile(path.join(ordner, "video.mp4"), "x", "utf8");
  await fs.writeFile(path.join(ordner, "audio.m4a"), "x", "utf8");
  await fs.writeFile(path.join(ordner, "beitrag.md"), "x", "utf8");
  await fs.writeFile(path.join(ordner, "notizen.txt"), "x", "utf8");
  await fs.writeFile(path.join(ordner, "bild.jpg"), "x", "utf8");
  await fs.writeFile(
    path.join(ordner, "unterordner", "zweites.mp3"),
    "x",
    "utf8",
  );
  await fs.writeFile(path.join(versteckt, "config"), "x", "utf8");
  await fs.writeFile(einzelVideo, "x", "utf8");
  await fs.writeFile(einzelFremd, "x", "utf8");
});

afterAll(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});

describe("collectMediaFiles", () => {
  it("findet eine einzelne Video-, Audio- oder Textdatei", async () => {
    const result = await collectMediaFiles(einzelVideo);
    expect(result).toMatchObject({ ok: true, files: [einzelVideo] });
  });

  it("lehnt eine einzelne Datei ab, deren Endung nicht dazugehört", async () => {
    const result = await collectMediaFiles(einzelFremd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/weder eine Video-/);
  });

  it("durchsucht einen Ordner rekursiv, ohne Bilder und versteckte Ordner", async () => {
    const result = await collectMediaFiles(ordner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const namen = result.files.map((file) => path.basename(file)).sort();
    expect(namen).toEqual(["audio.m4a", "beitrag.md", "notizen.txt", "video.mp4", "zweites.mp3"].sort());
  });

  it("meldet einen leeren Ordner als Fehler, legt aber nichts an", async () => {
    const result = await collectMediaFiles(leer);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/keine Video-/);
  });

  it("meldet einen nicht erreichbaren Pfad", async () => {
    const result = await collectMediaFiles(path.join(temp, "gibt-es-nicht"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/nicht erreichbar/);
  });
});
