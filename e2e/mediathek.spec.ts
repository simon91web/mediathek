import { expect, test } from "@playwright/test";

test.describe("Mediathek", () => {
  test("zeigt alle drei Medienarten", async ({ page }) => {
    await page.goto("/medien");
    await expect(
      page.getByRole("heading", { name: "Mediathek", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Vorflugkontrolle Elios 3")).toBeVisible();
    await expect(
      page.getByText("Akku-Grundlagen, unterwegs diktiert"),
    ).toBeVisible();
    await expect(page.getByText("Ein Messprotokoll lesen")).toBeVisible();
  });

  test("der Artfilter grenzt ein", async ({ page }) => {
    await page.goto("/medien");
    await page.getByRole("link", { name: "Sprachmemos" }).click();
    await expect(
      page.getByText("Akku-Grundlagen, unterwegs diktiert"),
    ).toBeVisible();
    await expect(page.getByText("Vorflugkontrolle Elios 3")).toHaveCount(0);
  });

  test("der Schlagwortfilter grenzt ein", async ({ page }) => {
    await page.goto("/medien");
    await page.getByRole("link", { name: /^akku/ }).first().click();
    await expect(page).toHaveURL(/schlagwort=akku/);
    await expect(
      page.getByText("Akku-Grundlagen, unterwegs diktiert"),
    ).toBeVisible();
  });

  test("ein Textbeitrag zeigt Abschnitte mit Ankern", async ({ page }) => {
    await page.goto("/medien/messprotokoll-lesen");

    // Die Überschriften des Textes sind die Kapitel — mit Anker.
    const heading = page.locator("#akku-und-spannung");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("Akku und Spannung");

    // Das Inhaltsverzeichnis verweist darauf.
    await expect(
      page.locator('a[href="#akku-und-spannung"]').first(),
    ).toBeVisible();

    // Doppelte Titel bekommen einen Zähler — hier gibt es "grenzwerte".
    await expect(page.locator("#grenzwerte")).toBeVisible();
  });

  test("ein Beitrag mit kaputtem Kopf bleibt benutzbar", async ({ page }) => {
    await page.goto("/medien/kaputter-kopf");

    // Der Titel kommt aus dem Ordnernamen, der Beitrag ist da.
    await expect(
      page.getByRole("heading", { name: "Kaputter Kopf", level: 1 }),
    ).toBeVisible();

    // Und der Hinweis erklärt, was nicht gelesen werden konnte.
    const banner = page.getByText(/Hinweise? zu diesem Beitrag/);
    await expect(banner).toBeVisible();
    await banner.click();
    await expect(page.getByText(/kein gültiges YAML/)).toBeVisible();
  });

  test("Verweise und Rückverweise zeigen in beide Richtungen", async ({
    page,
  }) => {
    await page.goto("/medien/akku-grundlagen");
    const related = page.getByRole("heading", { name: "Verwandte Stellen" });
    await expect(related).toBeVisible();

    // Der eigene Bezug führt an die genannte Zeitstelle …
    await expect(
      page.locator('a[href="/medien/vorflugkontrolle-elios-3?t=30"]'),
    ).toBeVisible();

    /*
     * … der Rückverweis dagegen an den Anfang des verweisenden Beitrags. Die
     * Zeitmarke des Bezugs gehört zu DIESEM Beitrag; ein "?t=" auf einen
     * Textbeitrag wäre unsinnig.
     */
    await expect(
      page.locator('a[href="/medien/messprotokoll-lesen"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('a[href*="/medien/messprotokoll-lesen?t="]'),
    ).toHaveCount(0);
  });

  test("ein Thema führt der Reihe nach durch die Beiträge", async ({
    page,
  }) => {
    await page.goto("/themen/drohnen-grundlagen");
    await expect(
      page.getByRole("heading", { name: "Drohnen-Grundlagen", level: 1 }),
    ).toBeVisible();
    // Ein genannter, aber fehlender Beitrag wird als Hinweis gezeigt.
    await expect(page.getByText("gibt-es-nicht")).toBeVisible();
  });

  test("ein Sprungziel aus der Adresse schlägt die gemerkte Stelle", async ({
    page,
  }) => {
    /*
     * Der Fehler, der dahintersteckt: vidstack stellt die zuletzt gesehene
     * Stelle beim Ereignis „can-play" wieder her — also NACH dem Sprung aus
     * „?t=". Wer aus einem Thema heraus auf eine Fundstelle klickte, landete
     * richtig und wurde einen Wimpernschlag später zurückgeworfen. Nur bei
     * schon gesehenen Beiträgen, deshalb „manchmal".
     */
    /*
     * Eine gemerkte Stelle bei 00:40 — unter genau dem Schlüssel, den
     * vidstack liest: Quelle, Anfang und Ende des Ausschnitts. Hinterlegt
     * VOR dem Laden der Seite, sonst käme sie zu spät.
     */
    await page.addInitScript(() =>
      localStorage.setItem("/api/medien/akku-grundlagen/audio.m4a:0:0", "40"),
    );

    await page.goto("/medien/akku-grundlagen?t=10");
    await page.waitForSelector("[data-media-player][data-can-play]");
    /*
     * Bewusst ein Wartemoment: die Wiederherstellung aus dem Speicher käme
     * erst NACH „can-play". Ohne ihn liefe der Test auch gegen den Fehler
     * grün, weil er vor dem Rückwurf messen würde.
     */
    await page.waitForTimeout(500);

    const time = await page.evaluate(
      () =>
        document.querySelector<HTMLMediaElement>("audio, video")?.currentTime ??
        -1,
    );
    expect(time).toBeGreaterThanOrEqual(9);
    expect(time).toBeLessThan(20);

    /*
     * Gegenprobe, und der Beweis, dass die Stelle wirklich hinterlegt war:
     * ohne Zeit in der Adresse wird weiter dort fortgesetzt, wo man aufgehört
     * hat.
     */
    await page.goto("/medien/akku-grundlagen");
    await page.waitForSelector("[data-media-player][data-can-play]");
    await page.waitForFunction(
      () =>
        (document.querySelector<HTMLMediaElement>("audio, video")
          ?.currentTime ?? 0) > 30,
    );
  });

  test("einen unbekannten Beitrag beantwortet die Mediathek freundlich", async ({
    page,
  }) => {
    const response = await page.goto("/medien/gibt-es-nicht-wirklich");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Diesen Beitrag gibt es nicht")).toBeVisible();
  });
});

test.describe("Bibliotheksordner", () => {
  test("ist gesperrt, wenn die Umgebungsvariable ihn vorgibt", async ({
    page,
  }) => {
    /*
     * Im Testlauf setzt playwright.config.ts MEDIATHEK_LIBRARY_DIR — genau
     * wie der Starter des Viewer-Pakets. Dann darf die Oberfläche den Ordner
     * nicht umstellen können; sonst könnte ein Testlauf sich selbst die
     * Bibliothek unter den Füßen wegziehen.
     */
    await page.goto("/einstellungen");

    await expect(
      page.getByText("Der Ordner ist beim Start vorgegeben"),
    ).toBeVisible();
    // Kein Eingabefeld — der Pfad steht nur als Text da.
    await expect(page.getByLabel("Bibliotheksordner")).toHaveCount(0);
    await expect(page.getByText("MEDIATHEK_LIBRARY_DIR")).toBeVisible();
  });
});
