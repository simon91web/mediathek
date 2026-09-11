import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

/*
 * Die Brücke zum KI-Assistenten.
 *
 * Was hier NICHT getestet wird: der tatsächliche Start. Er öffnet ein
 * sichtbares Fenster auf der Maschine, in dem ein Sprachmodell in die
 * Bibliothek schreibt — das gehört nicht in einen Testlauf. Geprüft wird
 * deshalb alles davor: die Riegel, die Beschriftungen und der Handbetrieb,
 * der ohne die Knöpfe funktionieren muss.
 *
 * Das Startskript prüft seine Eingaben mit ValidatePattern und lässt sich
 * mit -WhatIf gefahrlos vorführen — auch mit einem anderen Werkzeug:
 *
 *   .\scripts\assistent-starten.ps1 -LibraryDir S:\Mediathek `
 *       -Tool claude -Prompt "Befolge die Anweisungen in …" -WhatIf
 */

const LIBRARY = path.join(process.cwd(), "e2e", ".tmp-bibliothek");

const AUFGABEN = ["kapitel", "kapitel-alle", "bezuege", "themen", "glossar"];

test.describe("KI-Assistent", () => {
  test("die Anleitungen liegen in der Bibliothek, nicht im Programm", async () => {
    /*
     * Die Regeln müssen mit dem Ordner mitwandern: liegt er auf dem
     * Netzlaufwerk, arbeitet ein Kollege dort nach denselben.
     */
    const regeln = await fs.readFile(
      path.join(LIBRARY, "anleitungen", "REGELN.md"),
      "utf8",
    );
    expect(regeln).toContain("Du schreibst nur zwischen Markern");
    expect(regeln).toContain("Du erfindest nichts");

    for (const aufgabe of AUFGABEN) {
      await fs.access(path.join(LIBRARY, "anleitungen", `${aufgabe}.md`));
    }
  });

  test("die Anleitungen setzen kein bestimmtes Programm voraus", async () => {
    /*
     * Der Kern der Werkzeugunabhängigkeit: in den Anleitungen darf weder ein
     * Programmname noch ein Slash-Befehl stehen. Beides wäre eine Bindung an
     * Claude Code — und genau die soll hier nicht sein.
     */
    for (const aufgabe of AUFGABEN) {
      const text = await fs.readFile(
        path.join(LIBRARY, "anleitungen", `${aufgabe}.md`),
        "utf8",
      );
      expect(text, `${aufgabe}.md nennt ein Werkzeug`).not.toMatch(
        /\bclaude\b/i,
      );
      // "$1" ist Claude Codes Platzhalter für ein Slash-Argument.
      expect(text, `${aufgabe}.md benutzt $1`).not.toContain("$1");
    }
  });

  test("für Claude Code gibt es zusätzlich Abkürzungen", async () => {
    // Bequemlichkeit, kein Fundament: sie verweisen auf die Anleitungen.
    for (const aufgabe of AUFGABEN) {
      const text = await fs.readFile(
        path.join(LIBRARY, ".claude", "commands", `${aufgabe}.md`),
        "utf8",
      );
      expect(text).toContain(`anleitungen/${aufgabe}.md`);
    }
    const agents = await fs.readFile(path.join(LIBRARY, "AGENTS.md"), "utf8");
    expect(agents).toContain("anleitungen/REGELN.md");
  });

  test("ohne Transkript bleibt der Knopf aus, mit Begründung", async ({
    page,
  }) => {
    await page.goto("/medien/kaputter-kopf");

    const button = page.getByRole("button", { name: /Kapitel erzeugen lassen/ });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("title", /Erst transkribieren/);
  });

  test("mit Transkript ist der Knopf da", async ({ page }) => {
    await page.goto("/medien/vorflugkontrolle-elios-3");
    await expect(
      page.getByRole("button", { name: /Kapitel erzeugen lassen/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Verwandte Stellen suchen/ }),
    ).toBeVisible();
  });

  test("die Einstellungen zeigen Werkzeugwahl und Handbetrieb", async ({
    page,
  }) => {
    // Der Knopf ist Bequemlichkeit; der Weg von Hand ist der eigentliche.
    await page.goto("/einstellungen");
    await expect(
      page.getByRole("heading", { name: "KI-Assistent" }),
    ).toBeVisible();

    // Das Werkzeug ist wählbar, nicht verdrahtet.
    await expect(page.getByLabel("Programm")).toHaveValue("claude");
    await expect(
      page.getByLabel("Argumente vor dem Auftrag"),
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
