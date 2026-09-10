import { describe, expect, it } from "vitest";

import { parseChapterLines } from "@/lib/library/chapters";
import { CHAPTER_PLACEHOLDER, insertChapterLine } from "./chapter-line";

/*
 * Diese Tests halten fest, was der Knopf "Aktuelle Zeit als Kapitel" tut —
 * und dass das Ergebnis vom Parser wieder gelesen werden kann. Genau das ist
 * die Zusage: von Hand getippt, per Knopf eingefügt oder von Claude Code
 * geschrieben ergibt dasselbe Format.
 */

const WITH_BLOCK = [
  "---",
  "titel: Test",
  "---",
  "",
  "Beschreibung.",
  "",
  "<!-- kapitel:start -->",
  "00:00 Anfang",
  "02:00 Ende",
  "<!-- kapitel:ende -->",
  "",
].join("\n");

/** Der markierte Bereich muss genau der Titel sein. */
function selected(result: ReturnType<typeof insertChapterLine>): string {
  return result.content.slice(result.selectionStart, result.selectionEnd);
}

describe("insertChapterLine", () => {
  it("fügt an der richtigen Sortierstelle ein", () => {
    const result = insertChapterLine(WITH_BLOCK, 60);
    expect(parseChapterLines(result.content).map((c) => c.start)).toEqual([
      0, 60, 120,
    ]);
  });

  it("hängt hinten an, wenn die Zeit die späteste ist", () => {
    const result = insertChapterLine(WITH_BLOCK, 180);
    expect(parseChapterLines(result.content).map((c) => c.start)).toEqual([
      0, 120, 180,
    ]);
  });

  it("markiert den Platzhaltertitel, damit Tippen ihn ersetzt", () => {
    const result = insertChapterLine(WITH_BLOCK, 60);
    expect(selected(result)).toBe(CHAPTER_PLACEHOLDER);
  });

  it("ist sofort ein gültiges Kapitel, nicht erst nach dem Tippen", () => {
    const result = insertChapterLine(WITH_BLOCK, 60);
    const neu = parseChapterLines(result.content).find((c) => c.start === 60);
    expect(neu?.title).toBe(CHAPTER_PLACEHOLDER);
  });

  it("legt den Block an, wenn er fehlt", () => {
    const source = "---\ntitel: Test\n---\n\nNur Prosa.\n";
    const result = insertChapterLine(source, 95);
    expect(result.content).toContain("<!-- kapitel:start -->");
    expect(result.content).toContain("<!-- kapitel:ende -->");
    expect(parseChapterLines(result.content).map((c) => c.start)).toEqual([95]);
    expect(selected(result)).toBe(CHAPTER_PLACEHOLDER);
    // Die Prosa bleibt erhalten.
    expect(result.content).toContain("Nur Prosa.");
  });

  it("legt bei gleicher Zeit kein zweites Kapitel an, sondern markiert das vorhandene", () => {
    const result = insertChapterLine(WITH_BLOCK, 120);
    expect(result.content).toBe(WITH_BLOCK);
    expect(result.note).toContain("schon ein Kapitel");
    expect(selected(result)).toBe("Ende");
  });

  it("schreibt ab einer Stunde mit Stundenanteil", () => {
    const result = insertChapterLine(WITH_BLOCK, 3723);
    expect(result.content).toContain("1:02:03");
    expect(parseChapterLines(result.content).map((c) => c.start)).toContain(
      3723,
    );
  });

  it("rührt nichts außerhalb des Blocks an", () => {
    const result = insertChapterLine(WITH_BLOCK, 60);
    expect(result.content).toContain("titel: Test");
    expect(result.content).toContain("Beschreibung.");
    expect(result.content.split("<!-- kapitel:start -->")).toHaveLength(2);
  });

  it("bleibt mehrfach anwendbar und sortiert", () => {
    let content = WITH_BLOCK;
    for (const seconds of [150, 30, 90]) {
      content = insertChapterLine(content, seconds).content;
    }
    expect(parseChapterLines(content).map((entry) => entry.start)).toEqual([
      0, 30, 90, 120, 150,
    ]);
  });

  it("kommt mit einem leeren Kapitelblock aus", () => {
    const source = ["<!-- kapitel:start -->", "<!-- kapitel:ende -->", ""].join(
      "\n",
    );
    const result = insertChapterLine(source, 0);
    expect(parseChapterLines(result.content).map((c) => c.start)).toEqual([0]);
    expect(selected(result)).toBe(CHAPTER_PLACEHOLDER);
  });
});
