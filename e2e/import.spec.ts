import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

/*
 * Der Upload darf nichts verlieren.
 *
 * Dieser Test gehört zu einem echten Datenverlust: nachdem proxy.ts
 * dazugekommen war, kamen alle importierten Videos exakt 10,0 MB groß an,
 * ließen sich nicht abspielen, und ffprobe konnte sie nicht lesen. Der Grund
 * stand in der Next-Doku (proxyClientMaxBodySize): der Proxy klont jeden
 * Rumpf in den Arbeitsspeicher und kürzt ihn bei zehn Megabyte — "the
 * request will not fail or return an error to the client".
 *
 * Es genügte also, dass es die Datei proxy.ts GIBT. Deshalb prüft dieser
 * Test mit einer Datei ÜBER der Grenze, und deshalb prüft er die Größe auf
 * dem Datenträger und nicht den Statuscode.
 */

const LIBRARY = path.join(process.cwd(), "e2e", ".tmp-bibliothek");

/** Über der 10-MB-Grenze des Proxys, und nicht rund — damit man es sieht. */
const GROESSE = 11 * 1024 * 1024 + 777;

test.describe("Upload", () => {
  test("eine Datei über zehn Megabyte kommt vollständig an", async ({
    request,
    baseURL,
  }) => {
    /*
     * Die Endung ist für den Fehler unwichtig — gekürzt wurde der
     * Anfrage-Rumpf, nicht die Datei. .mp4 ist trotzdem richtig: es ist der
     * Fall, der in der Praxis auftrat.
     */
    const daten = Buffer.alloc(GROESSE);
    for (let i = 0; i < daten.length; i += 1) daten[i] = i % 251;

    const antwort = await request.put(
      `${baseURL}/api/import/hochladen?name=grosser-upload.mp4`,
      { data: daten, headers: { "content-type": "application/octet-stream" } },
    );

    /*
     * Bei aktivem Fehler stünde hier 400 mit "nur 10,0 MB von 11,0 MB
     * angekommen" — die Route lehnt eine unvollständige Datei inzwischen ab,
     * statt sie einzulesen. Beides wäre ein Fehlschlag, und beides ist eine
     * brauchbare Meldung.
     */
    expect(antwort.status(), await antwort.text()).toBe(200);
    const { slug } = (await antwort.json()) as { slug: string };
    expect(slug).toBe("grosser-upload");

    const datei = path.join(LIBRARY, "medien", slug, "video.mp4");
    const info = await fs.stat(datei);
    expect(info.size).toBe(GROESSE);

    // Stichprobe: es ist auch der richtige Inhalt, nicht nur die Länge.
    const handle = await fs.open(datei, "r");
    try {
      const puffer = Buffer.alloc(4);
      await handle.read(puffer, 0, 4, GROESSE - 4);
      expect([...puffer]).toEqual(
        [4, 3, 2, 1].map((rueck) => (GROESSE - rueck) % 251),
      );
    } finally {
      await handle.close();
    }

    // Die 11 MB nicht liegen lassen: der nächste Lauf kopiert die Bibliothek.
    await fs.rm(path.join(LIBRARY, "medien", slug), {
      recursive: true,
      force: true,
    });
  });

  test("eine unbekannte Endung wird abgelehnt", async ({
    request,
    baseURL,
  }) => {
    const antwort = await request.put(
      `${baseURL}/api/import/hochladen?name=liste.xlsx`,
      { data: "egal" },
    );
    expect(antwort.status()).toBe(415);
  });
});
