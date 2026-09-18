import path from "node:path";

import { describe, expect, it } from "vitest";

import { folderName, planLibraryFolder } from "./new-library";

const DATEN =
  process.platform === "win32" ? "D:\\Daten" : "/tmp/Daten";
const MEDIATHEK =
  process.platform === "win32" ? "D:\\Mediathek" : "/tmp/Mediathek";
const mediathekKlein =
  process.platform === "win32" ? "D:\\mediathek" : "/tmp/mediathek";

describe("folderName", () => {
  it("lässt einen lesbaren Namen lesbar", () => {
    // Anders als slugify: Ordnernamen sieht man im Explorer.
    expect(folderName("Meine Mediathek")).toBe("Meine Mediathek");
    expect(folderName("Schulungen 2026")).toBe("Schulungen 2026");
  });

  it("wirft Zeichen weg, die Windows im Ordnernamen verbietet", () => {
    expect(folderName('Video: "Test"?')).toBe("Video Test");
    expect(folderName("A/B\\C")).toBe("ABC");
  });

  it("entfernt Punkte und Leerzeichen am Ende", () => {
    /*
     * Windows schneidet sie still ab — und man hat einen Ordner, den man
     * danach kaum wieder los wird.
     */
    expect(folderName("Mediathek.")).toBe("Mediathek");
    expect(folderName("Mediathek  ")).toBe("Mediathek");
  });

  it("bleibt leer, wenn nichts Brauchbares übrig ist", () => {
    expect(folderName("///")).toBe("");
    expect(folderName("   ")).toBe("");
  });
});

describe("planLibraryFolder", () => {
  it("hängt den Namen an das Verzeichnis", () => {
    const plan = planLibraryFolder(DATEN, "Mediathek");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.target).toBe(path.join(DATEN, "Mediathek"));
    expect(plan.suggestParent).toBe(false);
  });

  it("schlägt den gewählten Ordner vor, wenn er schon so heißt", () => {
    /*
     * Der Fall, für den es diese Datei gibt: jemand legt D:\Mediathek selbst
     * an, wählt ihn und tippt „Mediathek". Wörtlich genommen entstünde
     * D:\Mediathek\Mediathek.
     */
    const plan = planLibraryFolder(MEDIATHEK, "Mediathek");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.suggestParent).toBe(true);
    // Der Vorschlag ersetzt das Ziel NICHT — entschieden wird in der Oberfläche.
    expect(plan.target).toBe(path.join(MEDIATHEK, "Mediathek"));
  });

  it("vergleicht ohne Rücksicht auf Groß- und Kleinschreibung", () => {
    // Unter Windows sind "Mediathek" und "mediathek" derselbe Ordner.
    const plan = planLibraryFolder(mediathekKlein, "Mediathek");
    expect(plan.ok && plan.suggestParent).toBe(true);
  });

  it("schlägt nichts vor, wenn der Ordner anders heißt", () => {
    const plan = planLibraryFolder(DATEN, "Mediathek");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.suggestParent).toBe(false);
  });

  it("lehnt einen relativen Pfad ab", () => {
    const plan = planLibraryFolder("Daten", "Mediathek");
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain("vollständigem Pfad");
  });

  it("lehnt einen Namen ab, aus dem kein Ordnername wird", () => {
    const plan = planLibraryFolder(DATEN, "??");
    expect(plan.ok).toBe(false);
  });

  it("lehnt Windows-Gerätenamen ab", () => {
    // "D:\Daten\CON" lässt sich nicht anlegen, und die Meldung wäre kryptisch.
    const plan = planLibraryFolder(DATEN, "con");
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain("Gerätename");
  });
});
