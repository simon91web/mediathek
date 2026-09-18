import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getCachedScreening, setCachedScreening } from "./cache";

/*
 * Der Cache ist der einzige Grund, warum ein zweiter Blick auf denselben
 * Ordner nicht wieder alles neu transkribiert — er MUSS also genau dann
 * ungültig werden, wenn sich die Datei wirklich geändert hat, und sonst
 * nicht.
 */

let temp: string;
let datei: string;

beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "mediathek-sichtung-cache-"));
  datei = path.join(temp, "clip.mp4");
  await fs.writeFile(datei, "erste Fassung", "utf8");
});

afterAll(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});

describe("Sichtung-Cache", () => {
  it("liefert null, solange nichts gespeichert ist", async () => {
    expect(await getCachedScreening(datei)).toBeNull();
  });

  it("liefert den gespeicherten Eintrag zurück, solange die Datei unverändert ist", async () => {
    await setCachedScreening(datei, {
      durationSec: 42,
      transcriptExcerpt: "Ein Testtranskript.",
      verdict: "neu",
      summary: "Zeigt etwas Neues.",
      matches: [],
    });

    const gefunden = await getCachedScreening(datei);
    expect(gefunden).toMatchObject({ verdict: "neu", durationSec: 42 });
  });

  it("wird ungültig, wenn sich die Datei ändert (anderes mtimeMs/size)", async () => {
    // Etwas Zeit vergehen lassen, damit sich mtimeMs sichtbar unterscheidet.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fs.writeFile(datei, "geänderte, längere Fassung", "utf8");

    expect(await getCachedScreening(datei)).toBeNull();
  });

  it("liefert wieder null für eine Datei, die es nicht mehr gibt", async () => {
    const verschwunden = path.join(temp, "weg.mp4");
    await fs.writeFile(verschwunden, "x", "utf8");
    await setCachedScreening(verschwunden, {
      durationSec: null,
      transcriptExcerpt: "x",
      verdict: "unklar",
      summary: "x",
      matches: [],
    });
    await fs.rm(verschwunden);

    expect(await getCachedScreening(verschwunden)).toBeNull();
  });
});
