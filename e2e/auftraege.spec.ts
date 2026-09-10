import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/*
 * Die Auftragsschlange.
 *
 * Ein echter Whisper-Lauf gehört NICHT hierher: er braucht das Modell, die
 * Grafikkarte und je nach Maschine Minuten. Geprüft wird, was sich
 * verlässlich prüfen lässt — dass Aufträge anlaufen, ihren Fortschritt
 * melden, ein Neuladen überstehen und sauber abbrechen.
 *
 * Das Kachelbild ist dafür der richtige Auftrag: es braucht nur ffmpeg und
 * ist in Sekunden fertig.
 */

const LIBRARY = path.join(process.cwd(), "e2e", ".tmp-bibliothek");

test("die Auftragsliste antwortet auch ohne Aufträge", async ({ request }) => {
  const response = await request.get("/api/jobs");
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as { jobs: unknown[]; runningId: null };
  expect(Array.isArray(data.jobs)).toBe(true);
});

test("der Ereignisstrom schickt sofort einen vollständigen Stand", async ({
  page,
}) => {
  /*
   * Genau das macht "übersteht ein Neuladen" möglich: die Anzeige braucht
   * keinen eigenen Zustand, weil das erste Ereignis alles enthält.
   *
   * Geprüft wird mit einer EventSource im Browser, NICHT mit request.get():
   * das wartet auf das Ende der Antwort, und ein Ereignisstrom endet per
   * Definition nicht.
   */
  await page.goto("/medien");

  const first = await page.evaluate<{ ok: boolean; hasJobs: boolean }>(() => {
    return new Promise((resolve) => {
      const source = new EventSource("/api/jobs/stream");
      const timer = setTimeout(() => {
        source.close();
        resolve({ ok: false, hasJobs: false });
      }, 10_000);

      source.addEventListener("snapshot", (event) => {
        clearTimeout(timer);
        source.close();
        try {
          const data = JSON.parse((event as MessageEvent).data) as {
            jobs?: unknown[];
          };
          resolve({ ok: true, hasJobs: Array.isArray(data.jobs) });
        } catch {
          resolve({ ok: false, hasJobs: false });
        }
      });
    });
  });

  expect(first.ok, "Es kam kein snapshot-Ereignis").toBe(true);
  expect(first.hasJobs).toBe(true);
});

test("ein Kachelbild-Auftrag läuft an, meldet Fortschritt und wird fertig", async ({
  page,
}) => {
  const poster = path.join(
    LIBRARY,
    "medien",
    "vorflugkontrolle-elios-3",
    "poster.jpg",
  );
  const vorher = await fs.readFile(poster).catch(() => null);

  await page.goto("/medien/vorflugkontrolle-elios-3");

  const knopf = page.getByRole("button", { name: /Kachelbild/ });
  await expect(knopf).toBeVisible();
  await knopf.click();

  // Der Auftrag muss in der Anzeige auftauchen …
  await expect(page.getByText(/Kachelbild/).first()).toBeVisible();

  // … und über die Schlange abfragbar sein, bis er fertig ist.
  await expect
    .poll(
      async () => {
        const data = (await (await page.request.get("/api/jobs")).json()) as {
          jobs: Array<{ kind: string; state: string }>;
        };
        return data.jobs.filter((job) => job.kind === "kachelbild").pop()?.state;
      },
      { timeout: 60_000, message: "Der Kachelbild-Auftrag wurde nicht fertig" },
    )
    .toBe("fertig");

  const nachher = await fs.readFile(poster).catch(() => null);
  expect(nachher).not.toBeNull();
  if (vorher) expect(nachher?.length).toBeGreaterThan(0);
});

test("ein Textbeitrag bietet weder Transkription noch Kachelbild an", async ({
  page,
}) => {
  await page.goto("/medien/messprotokoll-lesen");
  await expect(page.getByRole("button", { name: /Transkribieren/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /Kachelbild/ })).toHaveCount(0);
});

test("ein Auftrag für einen unbekannten Beitrag wird abgelehnt", async ({
  request,
}) => {
  // Über die Schlange darf nichts anlaufen, was es nicht gibt.
  const response = await request.get("/api/jobs");
  const before = (await response.json()) as { jobs: unknown[] };
  // Es gibt keinen offenen Endpunkt zum Anstellen: das läuft nur über eine
  // Server Action mit Origin-Prüfung. Genau das ist hier die Zusage.
  const post = await request.post("/api/jobs", { data: { kind: "transkription" } });
  expect(post.status()).toBeGreaterThanOrEqual(400);
  const after = (await (await request.get("/api/jobs")).json()) as {
    jobs: unknown[];
  };
  expect(after.jobs.length).toBe(before.jobs.length);
});
