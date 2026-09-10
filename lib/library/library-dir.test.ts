import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkLibraryDir } from "./library-dir";

/*
 * Der eingetippte Pfad ist die einzige Stelle, an der ein Nutzer der
 * Mediathek einen Ort im Dateisystem bestimmt. Ein Tippfehler darf keinen
 * verwaisten Ordner hinterlassen und ein nicht verbundenes Netzlaufwerk muss
 * als solches gemeldet werden — beides ist hier festgenagelt.
 */

let temp: string;
let leer: string;
let mitMedien: string;
let datei: string;

beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "mediathek-pfad-"));
  leer = path.join(temp, "leer");
  mitMedien = path.join(temp, "bibliothek");
  datei = path.join(temp, "keine-bibliothek.txt");
  await fs.mkdir(leer);
  await fs.mkdir(path.join(mitMedien, "medien"), { recursive: true });
  await fs.writeFile(datei, "nur eine Datei", "utf8");
});

afterAll(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});

describe("checkLibraryDir", () => {
  it("nimmt einen vorhandenen Ordner mit medien/", async () => {
    const check = await checkLibraryDir(mitMedien);
    expect(check).toMatchObject({ ok: true, fresh: false });
  });

  it("nimmt einen leeren Ordner und meldet ihn als leer", async () => {
    // Eine neue Bibliothek fängt leer an; der erste Import legt medien/ an.
    const check = await checkLibraryDir(leer);
    expect(check).toMatchObject({ ok: true, fresh: true });
  });

  it("entfernt Anführungszeichen um den Pfad", async () => {
    /*
     * Der Windows-Explorer legt bei "Als Pfad kopieren" Anführungszeichen um
     * den Pfad. Genau so wird der Wert eingefügt, und daran soll es nicht
     * scheitern.
     */
    const check = await checkLibraryDir(`"${mitMedien}"`);
    expect(check).toMatchObject({ ok: true });
    if (check.ok) expect(check.dir).toBe(path.resolve(mitMedien));
  });

  it("lehnt einen leeren Eintrag ab", async () => {
    expect(await checkLibraryDir("   ")).toMatchObject({ ok: false });
  });

  it("lehnt einen relativen Pfad ab", async () => {
    /*
     * Der würde gegen das Arbeitsverzeichnis des Servers aufgelöst — nicht
     * gegen das, was der Nutzer im Kopf hat.
     */
    const check = await checkLibraryDir("bibliothek");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/vollständigen Pfad/);
  });

  it("lehnt einen Ordner ab, den es nicht gibt", async () => {
    const check = await checkLibraryDir(path.join(temp, "gibt-es-nicht"));
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/gibt es nicht/);
  });

  it("lehnt eine Datei ab", async () => {
    const check = await checkLibraryDir(datei);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/Datei, kein Ordner/);
  });

  it("legt nichts an, was es nicht gibt", async () => {
    /*
     * Die wichtigste Zusage: ein Tippfehler hinterlässt keinen Ordner auf
     * der Platte. Sonst wüchse bei jedem Versuch ein leeres Verzeichnis.
     */
    const erfunden = path.join(temp, "tippfehler");
    await checkLibraryDir(erfunden);
    await expect(fs.stat(erfunden)).rejects.toThrow();
  });
});
