import { describe, expect, it } from "vitest";

import { computeRange, ifRangeMatches, makeWeakEtag } from "./range";

const SIZE = 1000;

describe("computeRange", () => {
  it("liefert ohne Range die ganze Datei", () => {
    expect(computeRange(null, SIZE)).toEqual({
      kind: "voll",
      start: 0,
      end: 999,
      length: 1000,
    });
    expect(computeRange("", SIZE).kind).toBe("voll");
  });

  it('antwortet auf "bytes=0-" mit einem Ausschnitt, nicht mit 200', () => {
    // Chrome schickt das als erste Anfrage. Mit 200 bricht das Springen.
    expect(computeRange("bytes=0-", SIZE)).toEqual({
      kind: "teil",
      start: 0,
      end: 999,
      length: 1000,
    });
  });

  it.each([
    ["bytes=0-0", 0, 0, 1],
    ["bytes=100-199", 100, 199, 100],
    ["bytes=999-", 999, 999, 1],
    ["bytes=500-99999", 500, 999, 500],
    ["  bytes = 100 - 199  ", 100, 199, 100],
    ["BYTES=0-9", 0, 9, 10],
  ])("liest %s als %i-%i", (header, start, end, length) => {
    expect(computeRange(header, SIZE)).toEqual({
      kind: "teil",
      start,
      end,
      length,
    });
  });

  it("beherrscht die Suffix-Range (Safari sucht so das moov-Atom)", () => {
    expect(computeRange("bytes=-500", SIZE)).toEqual({
      kind: "teil",
      start: 500,
      end: 999,
      length: 500,
    });
    // Mehr verlangt als vorhanden: ab Null ausliefern.
    expect(computeRange("bytes=-5000", SIZE)).toEqual({
      kind: "teil",
      start: 0,
      end: 999,
      length: 1000,
    });
  });

  it("weist Unerfüllbares mit 416 zurück", () => {
    expect(computeRange("bytes=1000-", SIZE).kind).toBe("unerfuellbar");
    expect(computeRange("bytes=99999-", SIZE).kind).toBe("unerfuellbar");
    expect(computeRange("bytes=-0", SIZE).kind).toBe("unerfuellbar");
    expect(computeRange("bytes=0-", 0).kind).toBe("unerfuellbar");
  });

  it("fällt bei allem Unklaren auf die ganze Datei zurück", () => {
    for (const header of [
      "bytes=abc",
      "bytes=",
      "items=0-",
      "bytes=200-100",
      "bytes=0-99,200-299",
      "bytes=--5",
      "quatsch",
    ]) {
      expect(computeRange(header, SIZE).kind, header).toBe("voll");
    }
  });

  it("liefert Ausschnitte, deren Länge zu start und end passt", () => {
    for (const header of ["bytes=0-0", "bytes=0-", "bytes=-1", "bytes=123-456"]) {
      const outcome = computeRange(header, SIZE);
      if (outcome.kind === "unerfuellbar") continue;
      expect(outcome.length, header).toBe(outcome.end - outcome.start + 1);
    }
  });
});

describe("makeWeakEtag", () => {
  it("ist stabil und ändert sich mit Größe oder Zeit", () => {
    const a = makeWeakEtag(1000, 1_700_000_000_000);
    expect(a).toBe(makeWeakEtag(1000, 1_700_000_000_000));
    expect(a).not.toBe(makeWeakEtag(1001, 1_700_000_000_000));
    expect(a).not.toBe(makeWeakEtag(1000, 1_700_000_001_000));
    expect(a.startsWith('W/"')).toBe(true);
  });
});

describe("ifRangeMatches", () => {
  const etag = makeWeakEtag(1000, 1_700_000_000_000);
  const lastModified = new Date(1_700_000_000_000);

  it("stimmt ohne Kopf immer zu", () => {
    expect(ifRangeMatches(null, etag, lastModified)).toBe(true);
  });

  it("vergleicht ETags", () => {
    expect(ifRangeMatches(etag, etag, lastModified)).toBe(true);
    expect(ifRangeMatches('W/"anders"', etag, lastModified)).toBe(false);
  });

  it("vergleicht Datumsangaben sekundengenau", () => {
    expect(
      ifRangeMatches(lastModified.toUTCString(), etag, lastModified),
    ).toBe(true);
    expect(
      ifRangeMatches(new Date(1_700_000_060_000).toUTCString(), etag, lastModified),
    ).toBe(false);
  });

  it("lehnt Unlesbares ab, damit die ganze Datei ausgeliefert wird", () => {
    expect(ifRangeMatches("gestern", etag, lastModified)).toBe(false);
  });
});
