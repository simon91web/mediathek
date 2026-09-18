import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/*
 * Der Editor — und mit ihm die von Hand gesetzte Kapitelmarke.
 *
 * Der zweite Test hier ist der wichtigere: er stellt sicher, dass ein
 * offener Editor NICHT überschreibt, was Claude Code inzwischen geschrieben
 * hat. Ohne diese Zusage wäre es unverantwortlich, ein Sprachmodell in diese
 * Dateien schreiben zu lassen.
 */

const LIBRARY = path.join(process.cwd(), "e2e", ".tmp-bibliothek");
const FILE = path.join(LIBRARY, "medien", "kaputter-kopf", "beitrag.md");

test("Kapitel per Knopf einfügen, speichern, und es steht in der Datei", async ({
  page,
}) => {
  const original = await fs.readFile(FILE, "utf8");

  try {
    await page.goto("/medien/kaputter-kopf/bearbeiten");
    const area = page.locator("#beitrag-md");
    await expect(area).toBeVisible();

    /*
     * Ein bestehender Beitrag öffnet im Lesemodus — erst in den
     * Schreibmodus wechseln, sonst lässt sich nichts eintippen.
     */
    await page.getByRole("button", { name: "Schreibmodus" }).click();

    /*
     * Der Editor ist kein <textarea> mehr, sondern CodeMirror: eine
     * Kapitelzeile von Hand tippen heißt jetzt wirklich tippen. Die
     * vorhandene Zeile "00:00 Anfang" anklicken (dekoriert als Kapitel-
     * Zeile, ein Klick zeigt sie roh und setzt den Cursor dort hin), ans
     * Zeilenende springen, eine neue Kapitelzeile darunter eintippen.
     */
    await area.getByText("Anfang", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("00:20 Von Hand getippt");

    // Wird sofort erkannt.
    await expect(page.getByText("Von Hand getippt").first()).toBeVisible();

    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Gespeichert.")).toBeVisible();

    // In der Datei steht sie auch.
    const saved = await fs.readFile(FILE, "utf8");
    expect(saved).toContain("00:20 Von Hand getippt");

    // Und die Ansicht zeigt sie als Kapitel.
    await page.goto("/medien/kaputter-kopf");
    await expect(page.getByText("Von Hand getippt")).toBeVisible();
  } finally {
    await fs.writeFile(FILE, original, "utf8");
  }
});

test("eine fremde Änderung wird nicht überschrieben", async ({ page }) => {
  const original = await fs.readFile(FILE, "utf8");

  try {
    await page.goto("/medien/kaputter-kopf/bearbeiten");
    const area = page.locator("#beitrag-md");
    await expect(area).toBeVisible();
    await page.getByRole("button", { name: "Schreibmodus" }).click();

    // Der Editor steht offen und hat etwas Ungespeichertes: ans Ende
    // springen (unabhängig davon, welche Zeile gerade dekoriert ist) und
    // dort weiterschreiben.
    await area.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\n\nMeine Ergänzung.");

    // Jetzt schreibt jemand anders — in der Praxis Claude Code.
    await fs.writeFile(
      FILE,
      `${original}\n\nVon Claude Code eingetragen.\n`,
      "utf8",
    );

    await page.getByRole("button", { name: "Speichern" }).click();

    // Kein stiller Verlust: der Konflikt wird gemeldet …
    await expect(
      page.getByText("Die Datei wurde außerhalb geändert"),
    ).toBeVisible();

    // … und die fremde Fassung steht noch in der Datei.
    const onDisk = await fs.readFile(FILE, "utf8");
    expect(onDisk).toContain("Von Claude Code eingetragen.");
    expect(onDisk).not.toContain("Meine Ergänzung.");

    // Die eigene Arbeit ist ebenfalls noch da.
    await expect(area).toContainText("Meine Ergänzung.");

    // Und die fremde Fassung lässt sich ansehen.
    await page.getByRole("button", { name: "Fremde Fassung ansehen" }).click();
    await expect(
      page.getByText("Von Claude Code eingetragen.").first(),
    ).toBeVisible();
  } finally {
    await fs.writeFile(FILE, original, "utf8");
  }
});

test("ein neuer Textbeitrag lässt sich anlegen", async ({ page }) => {
  const slug = "e2e-testbeitrag";
  const dir = path.join(LIBRARY, "medien", slug);

  try {
    await page.goto("/anlegen");
    await page.locator("#neu-titel").fill("E2E Testbeitrag");
    await expect(page.locator("#neu-slug")).toHaveValue(slug);
    await page.getByRole("button", { name: /Anlegen/ }).click();

    // Direkt im Editor, mit angelegter Vorlage.
    await expect(page).toHaveURL(new RegExp(`/medien/${slug}/bearbeiten`));
    await expect(page.locator("#beitrag-md")).toContainText(
      "titel: E2E Testbeitrag",
    );

    const written = await fs.readFile(
      path.join(dir, "beitrag.md"),
      "utf8",
    );
    expect(written).toContain("titel: E2E Testbeitrag");
    expect(written).toContain("<!-- zusammenfassung:start -->");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
