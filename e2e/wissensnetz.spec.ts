import { expect, test } from "@playwright/test";

/*
 * Das Wissensnetz: Themen mit Synonymen und Fundstellen, Sammlungen als
 * Ausschnittsfolge, und die Suche, die über Synonyme hinausgeht.
 *
 * Der wichtigste Test hier ist der Ausschnitt, der auf die Sekunde endet —
 * daran hängt das Versprechen "abspielbar als Ausschnitts-Playlist", und es
 * ist der einzige Teil, der Zeitverhalten braucht.
 */

test.describe("Themen", () => {
  test("eine Themenseite zeigt Synonyme und Fundstellen", async ({ page }) => {
    await page.goto("/themen/zellspannungsmessung");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Zellspannungsmessung",
    );
    await expect(page.getByText("Auch genannt:")).toBeVisible();
    await expect(page.getByText("Balancing")).toBeVisible();
    await expect(page.getByText("3 Fundstellen")).toBeVisible();

    // Eine reine Fundstellenseite behauptet keine "0 Teile".
    await expect(page.getByText("0 Teile")).toHaveCount(0);
  });

  test("eine Fundstelle führt an die Stelle im Beitrag", async ({ page }) => {
    await page.goto("/themen/zellspannungsmessung");
    await page
      .getByRole("link", { name: /Akku-Grundlagen/ })
      .first()
      .click();

    await expect(page).toHaveURL(/\/medien\/akku-grundlagen\?t=8/);
  });

  test("eine Fundstelle in einem Textbeitrag führt zum Abschnitt", async ({
    page,
  }) => {
    await page.goto("/themen/zellspannungsmessung");
    await page
      .getByRole("link", { name: /Messprotokoll/ })
      .first()
      .click();

    await expect(page).toHaveURL(/#akku-und-spannung$/);
  });

  test("der Beitrag nennt die Themen, die ihn als Fundstelle führen", async ({
    page,
  }) => {
    await page.goto("/medien/akku-grundlagen");

    const block = page.getByRole("region", {
      name: "Themen in diesem Beitrag",
    });
    await expect(block).toBeVisible();
    await expect(block.getByText("Zellspannungsmessung")).toBeVisible();

    /*
     * Die Zeitmarke ist ein Knopf, kein Link: innerhalb des laufenden
     * Beitrags soll gesprungen und nicht neu geladen werden. Derselbe
     * Zeitstempel steht auch in der Kapitelliste — deshalb im Abschnitt
     * suchen, nicht auf der ganzen Seite.
     */
    const jump = block.getByRole("button", { name: "00:08" });
    await expect(jump).toBeVisible();
    await jump.click();

    const time = await page.evaluate(
      () =>
        document.querySelector<HTMLMediaElement>("audio, video")?.currentTime ??
        -1,
    );
    expect(time).toBeGreaterThanOrEqual(7);
    expect(time).toBeLessThan(12);
  });

  test("ein geordnetes Thema führt weiter der Reihe nach", async ({ page }) => {
    // Die alte Kursfunktion muss neben den Fundstellen weiter bestehen.
    await page.goto("/themen/drohnen-grundlagen");
    await expect(page.getByText("3 Teile")).toBeVisible();
    await expect(page.getByText("Beiträge")).toBeVisible();
  });
});

test.describe("Sammlungen", () => {
  test("die Übersicht zeigt Liste und gespeicherte Suche", async ({ page }) => {
    await page.goto("/sammlungen");
    await expect(page.getByText("Alles zum Akku")).toBeVisible();
    await expect(page.getByText("3 Ausschnitte")).toBeVisible();
    await expect(
      page.getByText(/Gespeicherte Suche: .*zellspannung/),
    ).toBeVisible();
  });

  test("eine Sammlung ist von vorn abspielbar", async ({ page }) => {
    await page.goto("/sammlungen/alles-zum-akku");
    await page.getByRole("link", { name: "Von vorn abspielen" }).click();

    // Die Adresse trägt Anfang, Ende und die Stelle in der Folge.
    await expect(page).toHaveURL(
      /\/medien\/akku-grundlagen\?t=8&bis=18&sammlung=alles-zum-akku&nr=1/,
    );
    await expect(page.getByText("· Ausschnitt 1 von 3")).toBeVisible();
  });

  test("der Player hält am Ende des Ausschnitts an", async ({ page }) => {
    await page.goto(
      "/medien/akku-grundlagen?t=8&bis=18&sammlung=alles-zum-akku&nr=1",
    );

    // Auf die Metadaten warten — vorher verwirft der Browser jeden Sprung.
    await page.waitForFunction(() => {
      const media = document.querySelector<HTMLMediaElement>("audio, video");
      return media !== null && media.readyState >= 2;
    });

    /*
     * Kurz vor das Ende setzen und abspielen. Stumm, damit der Browser das
     * ohne Nutzergeste erlaubt.
     *
     * In der Warteschleife statt in einem einzelnen evaluate: solange
     * vidstack die Quelle noch einhängt, bricht ein play() mit
     * "interrupted by a new load request" ab. Hier wird es einfach wiederholt,
     * bis es greift.
     */
    await page.waitForFunction(
      () => {
        const media = document.querySelector<HTMLMediaElement>("audio, video");
        if (!media || media.readyState < 3) return false;
        media.muted = true;
        if (media.currentTime < 16) media.currentTime = 16.5;
        if (media.paused) void media.play().catch(() => {});
        return !media.paused;
      },
      null,
      { timeout: 15_000 },
    );

    await expect(page.getByText("Ausschnitt zu Ende")).toBeVisible({
      timeout: 10_000,
    });

    const state = await page.evaluate(() => {
      const media = document.querySelector<HTMLMediaElement>("audio, video")!;
      return { paused: media.paused, time: media.currentTime };
    });
    expect(state.paused).toBe(true);
    // Nicht darüber hinaus — genau das ist der Zweck.
    expect(state.time).toBeGreaterThan(17);
    expect(state.time).toBeLessThan(19);
  });

  test("weiter führt zum nächsten Ausschnitt der Folge", async ({ page }) => {
    await page.goto(
      "/medien/akku-grundlagen?t=8&bis=18&sammlung=alles-zum-akku&nr=1",
    );
    await page
      .getByRole("link", { name: /Vorflugkontrolle/ })
      .first()
      .click();

    await expect(page).toHaveURL(/nr=2/);
    await expect(page.getByText("· Ausschnitt 2 von 3")).toBeVisible();
  });

  test("eine gespeicherte Suche läuft beim Aufruf neu", async ({ page }) => {
    await page.goto("/sammlungen/ueberall-spannung");
    await expect(
      page.getByText("Gespeicherte Suche", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Was gerade dazu da ist")).toBeVisible();
    await expect(page.getByText(/Treffer/)).toBeVisible();
  });
});

test.describe("Suche über Synonyme", () => {
  test("findet über ein Synonym und sagt es auch", async ({ page }) => {
    /*
     * "balancing" kommt in der ganzen Bibliothek nicht vor — nur als Synonym
     * auf der Themenseite. Ohne die Erweiterung wäre hier kein Treffer.
     */
    await page.goto("/suche?q=balancing");

    await expect(page.getByText("Auch gesucht nach")).toBeVisible();
    await expect(page.getByText(/gefunden über/)).toBeVisible();
    await expect(
      page.getByText("Akku-Grundlagen, unterwegs diktiert").first(),
    ).toBeVisible();
  });

  test("ein direkter Treffer steht über einem erweiterten", async ({
    page,
  }) => {
    await page.goto("/suche?q=zellspannung");
    // Bei einer Anfrage mit echten Treffern führt keiner davon ein "über".
    const first = page.locator("ul > li").first();
    await expect(first.getByText(/gefunden über/)).toHaveCount(0);
  });

  test("erweitert nicht auf eine Wortmitte", async ({ page }) => {
    // "balancingfehler" ist ein anderes Wort — keine Gruppe darf anspringen.
    await page.goto("/suche?q=balancingfehler");
    await expect(page.getByText("Auch gesucht nach")).toHaveCount(0);
  });
});
