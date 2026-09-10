import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/*
 * DER wichtigste Test des Projekts.
 *
 * Er prüft die zentrale Zusage: Claude Code trägt Kapitel in beitrag.md ein,
 * und die Mediathek zeigt sie — ohne Serverneustart und ohne Zutun. Genau
 * diesen Weg nimmt der Slash-Command später; hier wird er mit einem
 * Dateischreibvorgang nachgestellt.
 */

const LIBRARY = path.join(process.cwd(), "e2e", ".tmp-bibliothek");
const FILE = path.join(
  LIBRARY,
  "medien",
  "vorflugkontrolle-elios-3",
  "beitrag.md",
);

test("ein von außen eingetragenes Kapitel erscheint ohne Serverneustart", async ({
  page,
  request,
}) => {
  await page.goto("/medien/vorflugkontrolle-elios-3");
  await expect(page.getByText("Nachbereitung")).toBeVisible();
  await expect(page.getByText("Von außen eingetragen")).toHaveCount(0);

  const before = (await (await request.get("/api/bibliothek")).json()) as {
    generation: number;
  };

  // So, wie Claude Code es täte: eine Zeile in den Kapitelblock schreiben.
  const original = await fs.readFile(FILE, "utf8");
  await fs.writeFile(
    FILE,
    original.replace(
      "02:10 Nachbereitung",
      "02:10 Nachbereitung\n02:40 Von außen eingetragen",
    ),
    "utf8",
  );

  try {
    // Der Beobachter meldet, der Client fragt die Kennzahl ab und lädt neu.
    await expect
      .poll(
        async () => {
          const data = (await (await request.get("/api/bibliothek")).json()) as {
            generation: number;
          };
          return data.generation;
        },
        { timeout: 20_000, message: "Die Bibliothek wurde nicht neu gelesen" },
      )
      .toBeGreaterThan(before.generation);

    // Und die offene Seite zieht nach, ohne dass jemand neu lädt.
    await expect(page.getByText("Von außen eingetragen")).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await fs.writeFile(FILE, original, "utf8");
  }
});
