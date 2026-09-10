import { expect, test } from "@playwright/test";

/*
 * Range-Prüfung ohne Browser. Läuft über die request-Fixture, braucht also
 * keine Wiedergabe — und deckt genau die Fälle ab, die das Springen im Player
 * kaputt machen, wenn sie falsch beantwortet werden.
 */

const VIDEO = "/api/medien/vorflugkontrolle-elios-3/video.mp4";
const AUDIO = "/api/medien/akku-grundlagen/audio.m4a";

test.describe("Medien ausliefern", () => {
  test("HEAD nennt Länge und Range-Fähigkeit", async ({ request }) => {
    const response = await request.head(VIDEO);
    expect(response.status()).toBe(200);
    expect(response.headers()["accept-ranges"]).toBe("bytes");
    expect(response.headers()["content-type"]).toBe("video/mp4");
    expect(Number(response.headers()["content-length"])).toBeGreaterThan(0);
  });

  test("bytes=0-99 liefert genau 100 Bytes als 206", async ({ request }) => {
    const response = await request.get(VIDEO, {
      headers: { Range: "bytes=0-99" },
    });
    expect(response.status()).toBe(206);
    expect(response.headers()["content-length"]).toBe("100");
    expect(response.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
    expect((await response.body()).byteLength).toBe(100);
  });

  test("bytes=0- liefert 206, nicht 200", async ({ request }) => {
    // Chrome schickt das als erste Anfrage. Mit 200 bricht das Springen.
    const response = await request.get(VIDEO, {
      headers: { Range: "bytes=0-" },
    });
    expect(response.status()).toBe(206);
  });

  test("die Suffix-Range holt das Dateiende", async ({ request }) => {
    // So sucht Safari das moov-Atom.
    const response = await request.get(VIDEO, {
      headers: { Range: "bytes=-10" },
    });
    expect(response.status()).toBe(206);
    expect((await response.body()).byteLength).toBe(10);
  });

  test("eine Range hinter dem Dateiende wird mit 416 abgelehnt", async ({
    request,
  }) => {
    const response = await request.get(VIDEO, {
      headers: { Range: "bytes=99999999-" },
    });
    expect(response.status()).toBe(416);
    expect(response.headers()["content-range"]).toMatch(/^bytes \*\/\d+$/);
  });

  test("die gelieferten Bytes stimmen mit dem Offset überein", async ({
    request,
  }) => {
    const whole = await (await request.get(VIDEO)).body();
    const middle = await (
      await request.get(VIDEO, { headers: { Range: "bytes=1000-1099" } })
    ).body();
    expect(Buffer.from(middle)).toEqual(
      Buffer.from(whole.subarray(1000, 1100)),
    );
  });

  test("Audio wird mit dem richtigen Typ ausgeliefert", async ({ request }) => {
    const response = await request.get(AUDIO, {
      headers: { Range: "bytes=0-49" },
    });
    expect(response.status()).toBe(206);
    expect(response.headers()["content-type"]).toBe("audio/mp4");
  });

  test("ein unbekannter Slug ergibt 404, kein sprechender Fehler", async ({
    request,
  }) => {
    for (const url of [
      "/api/medien/gibt-es-nicht/video.mp4",
      "/api/medien/vorflugkontrolle-elios-3/geheim.txt",
      "/api/medien/vorflugkontrolle-elios-3/anhaenge/gibt-es-nicht.pdf",
    ]) {
      const response = await request.get(url);
      expect(response.status(), url).toBe(404);
    }
  });

  test("Anhänge werden ausgeliefert, aber nur die eingetragenen", async ({
    request,
  }) => {
    const response = await request.get(
      "/api/medien/vorflugkontrolle-elios-3/anhaenge/pruefzettel.pdf",
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
  });
});
