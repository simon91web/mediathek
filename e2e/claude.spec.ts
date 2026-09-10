import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

/*
 * Die Claude-Code-Brücke.
 *
 * Was hier NICHT getestet wird: der tatsächliche Start. Er öffnet ein
 * sichtbares Fenster auf der Maschine, in dem ein Sprachmodell in die
 * Bibliothek schreibt — das gehört nicht in einen Testlauf. Geprüft wird
 * deshalb alles davor: die Riegel, die Beschriftungen und der Handbetrieb,
 * der ohne die Knöpfe funktionieren muss.
 *
 * Das Startskript selbst prüft seine Eingaben mit ValidateSet und
 * ValidatePattern und lässt sich mit -WhatIf gefahrlos vorführen:
 *
 *   .\scripts\kapitel-starten.ps1 -LibraryDir S:\Mediathek `
 *       -Command kapitel -Slug akku-grundlagen -WhatIf
 */

const LIBRARY = path.join(process.cwd(), "e2e", ".tmp-bibliothek");

test.describe("Claude-Code-Brücke", () => {
  test("der Vertrag liegt in der Bibliothek, nicht im Programm", async () => {
    /*
     * Die Regeln müssen mit dem Ordner mitwandern: liegt er auf dem
     * Netzlaufwerk, startet ein Kollege dort dieselbe Sitzung.
     */
    const contract = await fs.readFile(
      path.join(LIBRARY, ".claude", "CLAUDE.md"),
      "utf8",
    );
    expect(contract).toContain("Du schreibst nur zwischen Markern");
    expect(contract).toContain("Du erfindest nichts");

    for (const command of [
      "kapitel",
      "kapitel-alle",
      "bezuege",
      "themen",
      "glossar",
    ]) {
      await fs.access(
        path.join(LIBRARY, ".claude", "commands", `${command}.md`),
      );
    }
  });

  test("ohne Transkript bleibt der Knopf aus, mit Begründung", async ({
    page,
  }) => {
    await page.goto("/medien/kaputter-kopf");

    const button = page.getByRole("button", {
      name: /Kapitel per Claude Code/,
    });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("title", /Erst transkribieren/);
  });

  test("mit Transkript ist der Knopf da", async ({ page }) => {
    await page.goto("/medien/vorflugkontrolle-elios-3");
    await expect(
      page.getByRole("button", { name: /Kapitel per Claude Code/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Verwandte Stellen suchen/ }),
    ).toBeVisible();
  });

  test("die Einstellungen zeigen den Handbetrieb", async ({ page }) => {
    // Der Knopf ist Bequemlichkeit; der Weg von Hand ist der eigentliche.
    await page.goto("/einstellungen");
    await expect(
      page.getByRole("heading", { name: "Claude Code" }),
    ).toBeVisible();
    await expect(page.getByText(/cd .*tmp-bibliothek/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Themenseiten erzeugen/ }),
    ).toBeVisible();
  });

  test("ein fremder Host wird abgewiesen", async ({ request, baseURL }) => {
    /*
     * Gegen DNS-Rebinding: eine Seite im Browser kann einen eigenen Namen
     * auf 127.0.0.1 zeigen lassen. Die Bindung auf 127.0.0.1 allein hilft
     * dagegen nicht — nur die Prüfung des Namens.
     */
    const response = await request.get(`${baseURL}/`, {
      headers: { host: "boese.example.com" },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(403);
    expect(await response.text()).toContain("127.0.0.1");
  });
});
