import { afterEach, describe, expect, it } from "vitest";

import { defaultLibraryRoot } from "./paths";

const VORHER = process.env.MEDIATHEK_LIBRARY_DIR;

afterEach(() => {
  if (VORHER === undefined) delete process.env.MEDIATHEK_LIBRARY_DIR;
  else process.env.MEDIATHEK_LIBRARY_DIR = VORHER;
});

describe("defaultLibraryRoot", () => {
  it("nimmt die Umgebungsvariable, wenn sie gesetzt ist", () => {
    process.env.MEDIATHEK_LIBRARY_DIR = "D:\Mediathek";
    expect(defaultLibraryRoot().replace(/\//g, "\\")).toContain("Mediathek");
  });

  it("behandelt eine LEERE Variable wie eine nicht gesetzte", () => {
    /*
     * Nachgemessen am gepackten Server: mit "??" ergab der leere String
     * path.resolve("") — also das Arbeitsverzeichnis. Der Programmordner
     * wurde dadurch selbst zur Bibliothek. So kommt die Variable aus einer
     * cmd-Datei, wenn die bibliothek.txt leer ist.
     */
    process.env.MEDIATHEK_LIBRARY_DIR = "";
    expect(defaultLibraryRoot()).toContain("bibliothek-dev");

    process.env.MEDIATHEK_LIBRARY_DIR = "   ";
    expect(defaultLibraryRoot()).toContain("bibliothek-dev");
  });

  it("fällt ohne Variable auf bibliothek-dev zurück", () => {
    delete process.env.MEDIATHEK_LIBRARY_DIR;
    expect(defaultLibraryRoot()).toContain("bibliothek-dev");
  });
});
