import { expect, test } from "@playwright/test";

/*
 * Die Kette: Transkription → Kapitel → Suche → Bezüge mit einem Knopf.
 *
 * Was hier NICHT geprüft wird, ist der KI-Schritt selbst — er startet ein
 * Sprachmodell, das in die Bibliothek schreibt, und kostet Geld. Geprüft wird
 * alles davor: dass der Knopf da ist, dass die Kette nur anstellt, was fehlt,
 * dass sie ausdrücklich sagt, was sie übersprungen hat, und dass der
 * Suchschritt wirklich durchläuft.
 *
 * Dass die KI-Schritte im Testlauf übersprungen werden, ist kein Mangel,
 * sondern der geprüfte Riegel: ohne `autoAssistant` in den Einstellungen läuft
 * unbeaufsichtigt nichts.
 */

test.describe("Kette", () => {
  test("die Auftragsseite bietet beide Wege an", async ({ page }) => {
    await page.goto("/auftraege");

    await expect(
      page.getByRole("button", { name: "Alles erschließen" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Nur die Maschinenschritte" }),
    ).toBeVisible();

    // Die Reihenfolge steht in der Oberfläche, nicht nur im Code.
    await expect(
      page.getByText(/Transkription → Kapitel → Suche → Bezüge/),
    ).toBeVisible();
  });

  test("der Knopf am Beitrag stellt an, was fehlt, und sagt was nicht", async ({
    page,
  }) => {
    await page.goto("/medien/akku-grundlagen");

    const knopf = page.getByRole("button", { name: "Alles erschließen" });
    await expect(knopf).toBeVisible();
    await knopf.click();

    /*
     * Der Suchschritt ist immer fällig — er ist der einzige, der ohne
     * Zusatzwerkzeug läuft, und deshalb der verlässliche Beleg dafür, dass
     * aus dem Klick wirklich ein Auftrag wird.
     */
    await expect(page.getByText(/In der Schlange:/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Suche aktualisieren/)).toBeVisible();

    // Und die übersprungenen Schritte werden benannt, nicht verschwiegen.
    await expect(
      page.getByText(/Unbeaufsichtigte KI-Schritte sind aus/).first(),
    ).toBeVisible();
  });

  test("der angestellte Schritt läuft und meldet sein Ergebnis", async ({
    page,
  }) => {
    await page.goto("/medien/akku-grundlagen");
    await page.getByRole("button", { name: "Alles erschließen" }).click();
    await expect(page.getByText(/In der Schlange:/)).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/auftraege");
    // Der Index meldet am Ende, wie viele Blöcke er kennt.
    await expect(page.getByText(/Blöcke aus \d+ Beiträgen im Index/)).toBeVisible(
      { timeout: 30_000 },
    );
  });
});
