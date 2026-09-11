import { describe, expect, it } from "vitest";

import { splitAnswer } from "./answer-text";

describe("splitAnswer", () => {
  it("trennt Text und Verweis", () => {
    const stuecke = splitAnswer(
      "Der Zeitstempel beginnt nicht bei null [[cloud-compare-1#04:25]].",
    );
    expect(stuecke.map((stueck) => stueck.kind)).toEqual([
      "text",
      "verweis",
      "text",
    ]);
    expect(stuecke[0]).toEqual({
      kind: "text",
      text: "Der Zeitstempel beginnt nicht bei null ",
    });
    expect(stuecke[1]).toMatchObject({
      kind: "verweis",
      slug: "cloud-compare-1",
      target: { kind: "zeit", start: 265, end: null },
    });
    expect(stuecke[2]).toEqual({ kind: "text", text: "." });
  });

  it("erkennt eine Adresse und lässt den Satzpunkt draußen", () => {
    // Sonst zeigte der Link auf "handbuch." und liefe ins Leere.
    const stuecke = splitAnswer("Mehr steht auf https://example.org/handbuch.");
    expect(stuecke[1]).toEqual({
      kind: "web",
      url: "https://example.org/handbuch",
    });
    expect(stuecke[2]).toEqual({ kind: "text", text: "." });
  });

  it("kommt mit beidem in einem Satz zurecht", () => {
    const stuecke = splitAnswer(
      "Hier [[akku-grundlagen#00:15]], aus dem Netz https://example.org und fertig.",
    );
    expect(stuecke.map((stueck) => stueck.kind)).toEqual([
      "text",
      "verweis",
      "text",
      "web",
      "text",
    ]);
  });

  it("lässt einen kaputten Verweis Text bleiben", () => {
    // [[Großbuchstaben]] ist keine Kennung — dann ist es eben Text.
    const stuecke = splitAnswer("Siehe [[Cloud Compare]] dort.");
    expect(stuecke).toEqual([
      { kind: "text", text: "Siehe [[Cloud Compare]] dort." },
    ]);
  });

  it("gibt reinen Text unverändert zurück", () => {
    expect(splitAnswer("Nichts Besonderes.")).toEqual([
      { kind: "text", text: "Nichts Besonderes." },
    ]);
  });

  it("setzt den Text lückenlos wieder zusammen", () => {
    /*
     * Die eigentliche Zusicherung: was hineingeht, kommt heraus. Ein
     * verschluckter Halbsatz wäre beim Lesen kaum zu bemerken und beim
     * Beantworten fatal.
     */
    const text =
      "Eins [[a-b#01:00]] zwei https://example.org/x drei [[c-d]] vier.";
    const zusammen = splitAnswer(text)
      .map((stueck) =>
        stueck.kind === "text"
          ? stueck.text
          : stueck.kind === "web"
            ? stueck.url
            : stueck.raw,
      )
      .join("");
    expect(zusammen).toBe(text);
  });
});
