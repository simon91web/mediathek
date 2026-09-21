import { describe, expect, it } from "vitest";

import { parseGlossaryMarkdown } from "./glossary";

/*
 * Anders als eine Themendatei hat ein Begriff keine geordnete Beitragsliste
 * außerhalb der Marker — die ganze Definition ist Fließtext. Nur die
 * Fundstellen stehen im Marker-Block.
 */

const VOLL = `---
begriff: Erka-Control
schreibweisen: [Erko-Control, erka control]
---

Die Software, mit der die Rotorschutz-Käfige geprüft werden. Verweist auf
[[akku-grundlagen]] als Beispiel.

<!-- fundstellen:start -->
- [[akku-grundlagen#00:15]] Erwähnt im Zusammenhang mit der Zellprüfung
<!-- fundstellen:ende -->
`;

describe("parseGlossaryMarkdown", () => {
  it("liest den kanonischen Begriff und die Schreibweisen", () => {
    const entry = parseGlossaryMarkdown(VOLL, "erka-control");
    expect(entry.begriff).toBe("Erka-Control");
    expect(entry.schreibweisen).toEqual(["Erko-Control", "erka control"]);
  });

  it("nimmt die ganze Definition, inklusive Wikilinks", () => {
    const entry = parseGlossaryMarkdown(VOLL, "erka-control");
    expect(entry.description).toContain("[[akku-grundlagen]]");
    expect(entry.description).toContain("Rotorschutz-Käfige");
  });

  it("blendet den Fundstellen-Block aus der Definition aus", () => {
    const entry = parseGlossaryMarkdown(VOLL, "erka-control");
    expect(entry.description).not.toContain("fundstellen");
    expect(entry.description).not.toContain("Zellprüfung");
  });

  it("liest die Fundstellen aus dem Marker-Block", () => {
    const entry = parseGlossaryMarkdown(VOLL, "erka-control");
    expect(entry.spots).toEqual([
      {
        slug: "akku-grundlagen",
        target: { kind: "zeit", start: 15, end: null },
        note: "Erwähnt im Zusammenhang mit der Zellprüfung",
        sourceLine: 10,
      },
    ]);
  });

  it("fällt ohne titel/begriff auf den humanisierten Slug zurück", () => {
    const entry = parseGlossaryMarkdown("Nur Text, kein Kopf.", "elios-3");
    expect(entry.begriff).toBe("Elios 3");
  });

  it("kommt ohne Fundstellen-Block zurecht", () => {
    const entry = parseGlossaryMarkdown(
      "---\nbegriff: Testbegriff\n---\n\nKurze Definition.\n",
      "testbegriff",
    );
    expect(entry.spots).toEqual([]);
    expect(entry.description).toBe("Kurze Definition.");
  });

  it("meldet eine Fundstelle ohne gültigen Verweis als Hinweis", () => {
    const entry = parseGlossaryMarkdown(
      "---\nbegriff: X\n---\n\n<!-- fundstellen:start -->\n[[kaputt\n<!-- fundstellen:ende -->\n",
      "x",
    );
    expect(entry.problems.some((problem) => problem.kind === "bezug")).toBe(
      true,
    );
  });
});
