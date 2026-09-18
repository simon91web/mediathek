import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setLibraryRoot } from "@/lib/paths";
import { ensureInstructionFile } from "./install";

/*
 * Der Vorlauf vor jedem Werkzeug-Start soll die fehlende Anleitung selbst
 * anlegen, statt nur zu melden, wo man sie von Hand nachträgt (siehe
 * preflight.ts) — das war für Simon an einer laufenden Bibliothek nicht
 * auffindbar genug. Getestet wird gegen die ECHTEN Vorlagen in
 * vorlagen/bibliothek/ (kein Fake nötig, die liegen im Repo) und eine
 * Wegwerf-Bibliothek als Ziel.
 */

let temp: string;

beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "mediathek-anleitung-"));
  setLibraryRoot(temp);
});

afterAll(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});

describe("ensureInstructionFile", () => {
  it("legt eine fehlende Anleitung aus der echten Vorlage an", async () => {
    const datei = path.join(temp, "anleitungen", "vollstaendigkeit.md");
    await expect(fs.access(datei)).rejects.toThrow();

    const ok = await ensureInstructionFile("vollstaendigkeit");

    expect(ok).toBe(true);
    const inhalt = await fs.readFile(datei, "utf8");
    expect(inhalt).toContain("lose Enden");
  });

  it("fasst eine vorhandene Anleitung nicht an", async () => {
    const datei = path.join(temp, "anleitungen", "fragen.md");
    await fs.mkdir(path.dirname(datei), { recursive: true });
    await fs.writeFile(datei, "eigene, angepasste Fassung", "utf8");

    const ok = await ensureInstructionFile("fragen");

    expect(ok).toBe(true);
    expect(await fs.readFile(datei, "utf8")).toBe("eigene, angepasste Fassung");
  });

  it("meldet false, wenn selbst die Vorlage fehlt", async () => {
    const ok = await ensureInstructionFile("keine-solche-aufgabe");
    expect(ok).toBe(false);
  });
});
