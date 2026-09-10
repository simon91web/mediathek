import { expect, test } from "@playwright/test";

/*
 * Die Suche — und die Fälle, die den Zwei-Kanal-Ansatz rechtfertigen.
 *
 * Ohne den wörtlichen Durchgang findet MiniSearch die Wortmitte deutscher
 * Komposita nicht, und genau das ist bei "Vorflugkontrolle" der Regelfall.
 */

test.describe("Suche", () => {
  test("findet einen Begriff und nennt die Fundstellen", async ({ page }) => {
    await page.goto("/suche?q=zellspannung");
    await expect(page.getByText(/Fundstelle/)).toBeVisible();
    await expect(
      page.getByText("Akku-Grundlagen, unterwegs diktiert").first(),
    ).toBeVisible();
  });

  test("findet die Wortmitte deutscher Komposita", async ({ page }) => {
    // "kontrolle" steckt in "Vorflugkontrolle" — MiniSearch allein kann das
    // nicht, dafür gibt es den wörtlichen Durchgang.
    await page.goto("/suche?q=kontrolle");
    await expect(page.getByText("Vorflugkontrolle Elios 3").first()).toBeVisible();
  });

  test("ist gegenüber Umlauten gleichgültig", async ({ page }) => {
    await page.goto("/suche?q=aufblaehung");
    const ohneUmlaut = await page.getByText(/Fundstelle/).textContent();

    await page.goto("/suche?q=" + encodeURIComponent("Aufblähung"));
    const mitUmlaut = await page.getByText(/Fundstelle/).textContent();

    expect(ohneUmlaut).toBe(mitUmlaut);
    expect(ohneUmlaut).not.toContain("0 ");
  });

  test("ein Treffer im Gesprochenen führt an die Stelle", async ({ page }) => {
    await page.goto("/suche?q=zellspannung");

    // Ein Treffer mit Zeitmarke muss dabei sein.
    const link = page.locator('a[href*="?t="]').first();
    await expect(link).toBeVisible();

    const href = await link.getAttribute("href");
    expect(href).toMatch(/\/medien\/[a-z0-9-]+\?t=\d+/);

    await link.click();
    await expect(page).toHaveURL(/\?t=\d+/);
  });

  test("ein Treffer im Textbeitrag führt zum Abschnitt", async ({ page }) => {
    await page.goto("/suche?q=spreizung");
    const link = page.locator('a[href*="#"]').filter({ hasText: /Messprotokoll/ });
    await expect(link.first()).toBeVisible();
    expect(await link.first().getAttribute("href")).toMatch(/#[a-z0-9-]+$/);
  });

  test("eine Wortgruppe in Anführungszeichen wird wörtlich gesucht", async ({
    page,
  }) => {
    await page.goto("/suche?q=" + encodeURIComponent('"Akku prüfen"'));
    await expect(page.getByText(/Fundstelle/)).toBeVisible();

    // Die umgekehrte Reihenfolge darf nichts finden.
    await page.goto("/suche?q=" + encodeURIComponent('"prüfen Akku"'));
    await expect(page.getByText("Nichts gefunden")).toBeVisible();
  });

  test("markiert den Suchbegriff im Auszug", async ({ page }) => {
    await page.goto("/suche?q=zellspannung");
    // Die Markierung kommt aus Offsets, nicht aus HTML in den Daten.
    await expect(page.locator("mark").first()).toBeVisible();
    await expect(page.locator("mark").first()).toHaveText(/zellspannung/i);
  });

  test("sagt bei leerer Anfrage, was zu tun ist", async ({ page }) => {
    await page.goto("/suche");
    await expect(page.getByText("Wonach suchst du?")).toBeVisible();
  });

  test("das Suchfeld in der Kopfzeile führt zur Suche", async ({ page }) => {
    await page.goto("/medien");
    const box = page.getByLabel("In der Mediathek suchen");
    await box.fill("rotorschutz");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/suche\?q=rotorschutz/);
    await expect(page.getByText(/Fundstelle/)).toBeVisible();
  });
});
