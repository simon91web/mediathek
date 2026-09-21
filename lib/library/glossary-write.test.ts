import { describe, expect, it } from "vitest";

import { parseGlossaryMarkdown } from "./glossary";
import { buildGlossaryMarkdown } from "./glossary-write";

/*
 * Der Editor bearbeitet nur begriff, schreibweisen und die Definition — der
 * Fundstellen-Block ist das Schreibfenster von "Glossar sammeln" und muss
 * beim Speichern über den Editor unverändert stehen bleiben.
 */

const MIT_FUNDSTELLEN = `---
begriff: Erko-Control
schreibweisen: []
---

Alte Definition.

<!-- fundstellen:start -->
- [[akku-grundlagen#00:15]] Ein Fund
<!-- fundstellen:ende -->
`;

describe("buildGlossaryMarkdown", () => {
  it("übernimmt begriff, schreibweisen und Definition", () => {
    const content = buildGlossaryMarkdown({
      begriff: "Erka-Control",
      schreibweisen: ["Erko-Control"],
      description: "Neue Definition.",
      existingRaw: null,
    });
    const parsed = parseGlossaryMarkdown(content, "erka-control");
    expect(parsed.begriff).toBe("Erka-Control");
    expect(parsed.schreibweisen).toEqual(["Erko-Control"]);
    expect(parsed.description).toBe("Neue Definition.");
  });

  it("lässt einen vorhandenen Fundstellen-Block unangetastet", () => {
    const content = buildGlossaryMarkdown({
      begriff: "Erka-Control",
      schreibweisen: [],
      description: "Korrigierte Definition.",
      existingRaw: MIT_FUNDSTELLEN,
    });
    const parsed = parseGlossaryMarkdown(content, "erka-control");
    expect(parsed.begriff).toBe("Erka-Control");
    expect(parsed.description).toBe("Korrigierte Definition.");
    expect(parsed.spots).toEqual([
      {
        slug: "akku-grundlagen",
        target: { kind: "zeit", start: 15, end: null },
        note: "Ein Fund",
        sourceLine: 9,
      },
    ]);
  });

  it("legt ein leeres Fundstellen-Markerpaar an, wenn keins da war", () => {
    const content = buildGlossaryMarkdown({
      begriff: "Neu",
      schreibweisen: [],
      description: "",
      existingRaw: null,
    });
    expect(content).toContain("<!-- fundstellen:start -->");
    expect(content).toContain("<!-- fundstellen:ende -->");
  });

  it("quotiert eine Schreibweise mit Komma korrekt", () => {
    const content = buildGlossaryMarkdown({
      begriff: "X",
      schreibweisen: ["Erko, Control", "Erka"],
      description: "",
      existingRaw: null,
    });
    const parsed = parseGlossaryMarkdown(content, "x");
    expect(parsed.schreibweisen).toEqual(["Erko, Control", "Erka"]);
  });
});
