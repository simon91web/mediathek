import { describe, expect, it } from "vitest";

import { parseRotationDeg } from "./probe";

/*
 * Handys und Actioncams speichern eine Hochkant-Aufnahme oft als querliegende
 * Pixel mit einem Rotations-Vermerk statt getauschter Breite/Höhe. Neuere
 * Container tragen das als `side_data_list`-Eintrag ("Display Matrix"),
 * ältere als Zeichenkette im Tag `rotate`. Ergebnis ist immer 0–359.
 */
describe("parseRotationDeg", () => {
  it("liefert 0 ohne Videostrom", () => {
    expect(parseRotationDeg(undefined)).toBe(0);
  });

  it("liefert 0 ohne jede Rotationsangabe", () => {
    expect(parseRotationDeg({})).toBe(0);
  });

  it("liest die Display Matrix", () => {
    expect(
      parseRotationDeg({
        side_data_list: [{ side_data_type: "Display Matrix", rotation: 90 }],
      }),
    ).toBe(90);
  });

  it("normalisiert eine negative Drehung", () => {
    expect(
      parseRotationDeg({
        side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }],
      }),
    ).toBe(270);
  });

  it("ignoriert einen anderen side_data-Eintrag", () => {
    expect(
      parseRotationDeg({
        side_data_list: [{ side_data_type: "Something Else", rotation: 90 }],
        tags: { rotate: "180" },
      }),
    ).toBe(180);
  });

  it("fällt auf das ältere Tag rotate zurück", () => {
    expect(parseRotationDeg({ tags: { rotate: "270" } })).toBe(270);
  });

  it("kommt mit einem kaputten Tag zurecht", () => {
    expect(parseRotationDeg({ tags: { rotate: "keine-zahl" } })).toBe(0);
  });

  it("rundet und normalisiert auf 0–359", () => {
    expect(
      parseRotationDeg({
        side_data_list: [
          { side_data_type: "Display Matrix", rotation: -180.4 },
        ],
      }),
    ).toBe(180);
  });
});
