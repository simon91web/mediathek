import { describe, expect, it } from "vitest";

import { displaySize, posterScaleFilter } from "./poster";

describe("displaySize", () => {
  it("lässt Landschaft unverändert", () => {
    expect(displaySize(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
  });

  it("lässt eine echte Hochkant-Aufnahme unverändert", () => {
    expect(displaySize(360, 640, 0)).toEqual({ width: 360, height: 640 });
  });

  it("tauscht bei einer 90°-Drehung", () => {
    expect(displaySize(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
  });

  it("tauscht auch bei 270°", () => {
    expect(displaySize(1920, 1080, 270)).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it("tauscht bei 180° nicht — nur auf dem Kopf, nicht gedreht", () => {
    expect(displaySize(1920, 1080, 180)).toEqual({
      width: 1920,
      height: 1080,
    });
  });
});

/*
 * Der alte, feste Filter `scale=1280:-2` machte aus einer Hochkant-Aufnahme
 * ein absurd hohes Bild (nachgemessen: 360×640 → 1280×2276). Skaliert wird
 * deshalb auf die lange Seite — bei Hochkant die Höhe, sonst die Breite.
 */
describe("posterScaleFilter", () => {
  it("skaliert Landschaft auf die Breite", () => {
    expect(posterScaleFilter(1920, 1080, 0)).toBe("scale=1280:-2:flags=lanczos");
  });

  it("skaliert echtes Hochkant auf die Höhe", () => {
    expect(posterScaleFilter(360, 640, 0)).toBe("scale=-2:1280:flags=lanczos");
  });

  it("erkennt per Rotations-Tag gedrehtes Hochkant", () => {
    // Handy liefert 1920×1080 Rohpixel, zeigt aber per Rotation hochkant an.
    expect(posterScaleFilter(1920, 1080, 90)).toBe("scale=-2:1280:flags=lanczos");
  });

  it("bleibt bei fehlenden Maßen auf dem Landschafts-Filter", () => {
    expect(posterScaleFilter(0, 0, 0)).toBe("scale=1280:-2:flags=lanczos");
  });
});
