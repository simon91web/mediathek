import { describe, expect, it } from "vitest";

import { parseItemFrontmatter, splitFrontmatter } from "@/lib/library/frontmatter";
import { setTitleLine } from "./title-line";

/*
 * Diese Tests halten fest, was der Stift neben der Überschrift im Editor
 * tut — und dass das Ergebnis vom Frontmatter-Parser wieder gelesen werden
 * kann. Alles außerhalb der titel-Zeile muss Zeichen für Zeichen stehen
 * bleiben, exakt wie bei einer eingefügten Kapitelzeile.
 */

function titleOf(content: string): string | null {
  const split = splitFrontmatter(content);
  return parseItemFrontmatter(split.frontmatterText).data.title;
}

const BASIC = [
  "---",
  "titel: Alter Titel",
  "schlagworte: [test]",
  "---",
  "",
  "Beschreibung.",
  "",
].join("\n");

describe("setTitleLine", () => {
  it("ersetzt nur den Wert der titel-Zeile", () => {
    const result = setTitleLine(BASIC, "Neuer Titel");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(titleOf(result.content)).toBe("Neuer Titel");
    // Alles andere bleibt unangetastet.
    expect(result.content).toContain("schlagworte: [test]");
    expect(result.content).toContain("Beschreibung.");
  });

  it("quotiert nur, wenn YAML es braucht (Doppelpunkt im Titel)", () => {
    const result = setTitleLine(BASIC, "Vorflug: Checkliste");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain('titel: "Vorflug: Checkliste"');
    expect(titleOf(result.content)).toBe("Vorflug: Checkliste");
  });

  it("übernimmt die englische Schreibweise, wenn die Datei sie schon nutzt", () => {
    const source = ["---", "title: Old", "---", ""].join("\n");
    const result = setTitleLine(source, "New");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain("title: New");
    expect(result.content).not.toMatch(/^titel:/m);
  });

  it("fügt eine titel-Zeile ein, wenn keine da ist", () => {
    const source = ["---", "schlagworte: []", "---", ""].join("\n");
    const result = setTitleLine(source, "Neu");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(titleOf(result.content)).toBe("Neu");
  });

  it("trimmt Leerraum am Rand", () => {
    const result = setTitleLine(BASIC, "  Mit Rand  ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(titleOf(result.content)).toBe("Mit Rand");
  });

  it("lehnt einen leeren Titel ab", () => {
    const result = setTitleLine(BASIC, "   ");
    expect(result).toEqual({
      ok: false,
      reason: "Der Titel darf nicht leer sein.",
    });
  });

  it("lehnt eine Datei ohne Kopfbereich ab", () => {
    const result = setTitleLine("Nur Text, kein Frontmatter.", "Neu");
    expect(result.ok).toBe(false);
  });

  it("lehnt einen nie geschlossenen Kopfbereich ab", () => {
    const result = setTitleLine("---\ntitel: X\n\nkein Ende", "Neu");
    expect(result.ok).toBe(false);
  });
});
