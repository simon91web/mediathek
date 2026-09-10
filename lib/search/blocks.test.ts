import { describe, expect, it } from "vitest";

import {
  buildSectionChapters,
  buildTimeChapters,
  parseChapterLines,
  parseSectionLines,
} from "@/lib/library/chapters";
import type { TranscriptSegment } from "@/lib/library/types";
import { blocksFromText, blocksFromTranscript } from "./blocks";

/** Ein Transkript mit vorhersagbaren Wortzahlen bauen. */
function segments(count: number, wordsEach = 8): TranscriptSegment[] {
  return Array.from({ length: count }, (_, i) => ({
    start: i * 4,
    end: i * 4 + 3.5,
    text: Array.from({ length: wordsEach }, (_, w) => `wort${i}x${w}`).join(" "),
  }));
}

describe("blocksFromTranscript", () => {
  it("fasst Segmente zu Blöcken zusammen", () => {
    // 10 Segmente x 8 Wörter = 80 Wörter, Zielgröße 40 → etwa zwei Blöcke.
    const blocks = blocksFromTranscript("test", segments(10), []);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.length).toBeLessThan(10);
  });

  it("setzt den Blockanfang auf das erste Segment", () => {
    const blocks = blocksFromTranscript("test", segments(10), []);
    expect(blocks[0].start).toBe(0);
    expect(blocks[1].start).toBeGreaterThan(0);
  });

  it("schneidet an Kapitelgrenzen", () => {
    /*
     * Sonst würde ein Block über den Kapitelwechsel reichen und in der
     * Trefferliste dem falschen Kapitel zugeschlagen.
     */
    const { chapters } = buildTimeChapters(
      parseChapterLines("00:00 Erstes\n00:08 Zweites"),
      { durationSeconds: 100 },
    );
    const blocks = blocksFromTranscript("test", segments(6, 3), chapters);
    const titel = blocks.map((block) => block.chapterTitle);
    expect(titel).toContain("Erstes");
    expect(titel).toContain("Zweites");
    // Kein Block darf zwei Kapitel überspannen.
    for (const block of blocks) {
      expect(block.chapterTitle).not.toBeUndefined();
    }
  });

  it("hält die Blöcke unter der Zeitgrenze", () => {
    // Wenige Wörter, aber lange Segmente: die Sekundengrenze muss greifen.
    const lang: TranscriptSegment[] = Array.from({ length: 8 }, (_, i) => ({
      start: i * 12,
      end: i * 12 + 11,
      text: `kurz${i}`,
    }));
    const blocks = blocksFromTranscript("test", lang, []);
    expect(blocks.length).toBeGreaterThan(1);
  });

  it("kommt mit einem leeren Transkript aus", () => {
    expect(blocksFromTranscript("test", [], [])).toEqual([]);
  });
});

describe("blocksFromText", () => {
  const body = [
    "Ein Messprotokoll trägt vier Aussagen.",
    "",
    "## Kopfdaten prüfen",
    "",
    "Objekt, Datum, Gerät und Prüfer gehören hinein.",
    "",
    "## Akku und Spannung",
    "",
    "Interessant ist die Spreizung, nicht der Mittelwert.",
  ].join("\n");

  const { chapters } = buildSectionChapters(parseSectionLines(body));

  it("vergibt den Anker des Abschnitts als Sprungziel", () => {
    const blocks = blocksFromText("test", body, chapters);
    const akku = blocks.find((block) => block.text.includes("Spreizung"));
    expect(akku?.anchor).toBe("akku-und-spannung");
    expect(akku?.chapterTitle).toBe("Akku und Spannung");
  });

  it("lässt den Text vor der ersten Überschrift ohne Anker", () => {
    const blocks = blocksFromText("test", body, chapters);
    const einleitung = blocks.find((block) => block.text.includes("vier Aussagen"));
    expect(einleitung?.anchor).toBeNull();
  });

  it("setzt bei Textbeiträgen kein Zeitziel", () => {
    for (const block of blocksFromText("test", body, chapters)) {
      expect(block.start).toBeNull();
    }
  });

  it("entfernt Markdown-Auszeichnung aus dem Suchtext", () => {
    const blocks = blocksFromText(
      "test",
      "Ein **fetter** Hinweis mit [Link](https://example.com) und `Code`.",
      [],
    );
    const text = blocks.map((block) => block.text).join(" ");
    expect(text).toContain("fetter");
    expect(text).toContain("Link");
    expect(text).not.toContain("**");
    expect(text).not.toContain("https://example.com");
    expect(text).not.toContain("`");
  });

  it("löst Wikilinks auf den Namen auf", () => {
    const blocks = blocksFromText(
      "test",
      "Siehe [[akku-grundlagen#12:40]] dazu.",
      [],
    );
    expect(blocks[0].text).toContain("akku-grundlagen");
    expect(blocks[0].text).not.toContain("[[");
  });

  it("kommt mit einem leeren Text aus", () => {
    expect(blocksFromText("test", "", [])).toEqual([]);
  });
});
