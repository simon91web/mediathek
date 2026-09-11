import { expect, test } from "@playwright/test";

/*
 * Das FAQ: abgelegte Fragen, ihre Antworten und die Belege darin.
 *
 * Der wichtigste Test hier ist der letzte — ein Beleg mitten im Antworttext
 * muss das Video an der belegten Sekunde öffnen. Daran hängt die Zusage
 * „Quellenangaben mit Verweis": eine Antwort, die nur behauptet, wo etwas
 * steht, ist eine Hausaufgabe.
 */

test.describe("Fragen", () => {
  test("die Übersicht zeigt die abgelegte Frage", async ({ page }) => {
    await page.goto("/fragen");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fragen");
    await expect(
      page.getByRole("link", { name: "Wie messe ich die Zellspannung?" }),
    ).toBeVisible();
  });

  test("der Filter läuft über die Adresse und findet über die Antwort", async ({
    page,
  }) => {
    // Auch die andere Formulierung und der Antworttext zählen, nicht nur die Frage.
    await page.goto("/fragen?q=Zellpr%C3%BCfer");
    await expect(
      page.getByRole("link", { name: "Wie messe ich die Zellspannung?" }),
    ).toBeVisible();

    await page.goto("/fragen?q=gibtesnicht");
    await expect(page.getByText("Dazu gibt es noch nichts")).toBeVisible();
  });

  test("die Frageseite zeigt Umformulierungen und Belege", async ({ page }) => {
    await page.goto("/fragen/zellspannung-messen");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Wie messe ich die Zellspannung?",
    );

    const auchGefragt = page.getByRole("region", { name: "Auch gefragt" });
    await expect(auchGefragt).toBeVisible();
    await expect(
      auchGefragt.getByText("Womit prüfe ich die einzelnen Zellen?"),
    ).toBeVisible();

    // Die gesammelte Liste unter der Antwort.
    const belege = page.getByRole("region", { name: "Belege" });
    await expect(belege.getByRole("link")).toHaveCount(2);
  });

  test("ein Beleg im Antworttext springt an die Stelle im Beitrag", async ({
    page,
  }) => {
    await page.goto("/fragen/zellspannung-messen");

    /*
     * Der Beleg steht MITTEN im Satz, nicht in der Liste darunter — deshalb
     * der Abschnitt „Antwort" als Bezugsrahmen. Beschriftet ist er mit dem
     * Titel des Beitrags, nicht mit der Kennung: eine Antwort soll lesbar
     * bleiben.
     */
    const antwort = page.getByRole("region", { name: "Antwort" });
    const beleg = antwort.getByRole("link", { name: /00:08/ });
    await expect(beleg).toBeVisible();
    await beleg.click();

    await expect(page).toHaveURL(/\/medien\/akku-grundlagen\?t=8/);
    await page.waitForSelector("[data-media-player][data-can-play]");

    const time = await page.evaluate(
      () =>
        document.querySelector<HTMLMediaElement>("audio, video")?.currentTime ??
        -1,
    );
    expect(time).toBeGreaterThanOrEqual(7);
    expect(time).toBeLessThan(12);
  });

  test("ein Beleg auf einen Abschnitt führt in den Textbeitrag", async ({
    page,
  }) => {
    await page.goto("/fragen/zellspannung-messen");
    const belege = page.getByRole("region", { name: "Belege" });
    await belege.getByRole("link", { name: /Messprotokoll/ }).click();

    await expect(page).toHaveURL(/#akku-und-spannung$/);
  });

  /*
   * ZULETZT in dieser Datei, und das mit Absicht: der Test löscht die
   * Fixture-Frage wirklich. Die Bibliothek ist eine Kopie, die vor jedem
   * Lauf neu entsteht (e2e/prepare.ts) — aber die Tests darüber brauchen
   * die Datei noch.
   */
  test("eine Frage lässt sich wieder entfernen", async ({ page }) => {
    /*
     * Das Gegenstück zum Ablegen ohne Nachfrage: weil jede Frage von selbst
     * in der Bibliothek landet, MUSS das Wegräumen leicht sein — sonst
     * überlegt man beim Fragen, ob die Frage gut genug ist.
     */
    await page.goto("/fragen/zellspannung-messen");
    await page.getByRole("button", { name: "Diese Frage entfernen" }).click();

    // Einmal wird gefragt: es wird eine Datei gelöscht.
    await expect(page.getByText(/samt Antwort löschen/)).toBeVisible();
    await page.getByRole("button", { name: "Ja, entfernen" }).click();

    await expect(page).toHaveURL(/\/fragen$/);
    await expect(page.getByText("Noch keine Fragen")).toBeVisible();
  });
});
