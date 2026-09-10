import { formatTimecode, parseChapterLines } from "@/lib/library/chapters";
import { closeMarker, findBlocks, openMarker } from "@/lib/library/sections";

/*
 * Der Knopf "Aktuelle Zeit als Kapitel" im Editor.
 *
 * Damit ist die von Hand gesetzte Kapitelmarke erledigt, ohne einen zweiten
 * Mechanismus zu bauen: geschrieben wird dieselbe Zeile, die auch Claude Code
 * schreibt und die der Parser wieder einliest.
 *
 * Rein und ohne Dateizugriff, damit die Einfügelogik testbar bleibt.
 */

/**
 * Eine Zeile aus Zeit ohne Titel ist nach den Parser-Regeln KEIN Kapitel —
 * eine nackte Zeitangabe soll Beschreibungstext bleiben dürfen. Ohne
 * Platzhalter verschwände die gerade gesetzte Marke also scheinbar wieder.
 *
 * Deshalb wird ein Platzhalter eingefügt und gleich markiert: das Kapitel ist
 * sofort in Liste und Zeitleiste sichtbar, und das erste getippte Zeichen
 * ersetzt den Platzhalter.
 */
export const CHAPTER_PLACEHOLDER = "Neues Kapitel";

export type InsertResult = {
  content: string;
  /** Anfang der Markierung (Beginn des Titels). */
  selectionStart: number;
  /** Ende der Markierung. */
  selectionEnd: number;
  /** Was passiert ist — für eine kurze Rückmeldung. */
  note: string;
};

/**
 * Fügt eine Kapitelzeile an der richtigen Sortierstelle ein.
 *
 * Der Block wird angelegt, wenn er fehlt. Steht bei dieser Sekunde schon ein
 * Kapitel, wird nichts eingefügt — stattdessen wird dessen Titel markiert.
 */
export function insertChapterLine(
  source: string,
  seconds: number,
  options: { forceHours?: boolean } = {},
): InsertResult {
  const time = formatTimecode(seconds, options);
  const newLine = `${time} ${CHAPTER_PLACEHOLDER}`;
  const { blocks } = findBlocks(source);
  const block = blocks.get("kapitel");

  // Kein Kapitelblock: einen anlegen und die erste Zeile hineinschreiben.
  if (!block) {
    const separator = source.endsWith("\n") || source === "" ? "" : "\n";
    const prefix = `${source}${separator}\n${openMarker("kapitel")}\n`;
    const titleStart = prefix.length + time.length + 1;
    return {
      content: `${prefix}${newLine}\n${closeMarker("kapitel")}\n`,
      selectionStart: titleStart,
      selectionEnd: titleStart + CHAPTER_PLACEHOLDER.length,
      note: `Kapitel bei ${time} angelegt.`,
    };
  }

  const lines = source.split("\n");
  const inner = block.inner.split("\n");
  const existing = parseChapterLines(block.inner);

  const duplicate = existing.find((entry) => entry.start === seconds);
  if (duplicate) {
    // Schon vorhanden: dessen Titel markieren statt ein zweites Kapitel bauen.
    const lineIndex = block.innerStartLine - 1 + duplicate.line - 1;
    const lineStart = offsetOfLine(lines, lineIndex);
    const titleStart =
      lineStart + lines[lineIndex].length - duplicate.title.length;
    return {
      content: source,
      selectionStart: titleStart,
      selectionEnd: titleStart + duplicate.title.length,
      note: `Bei ${time} steht schon ein Kapitel.`,
    };
  }

  /*
   * Einfügestelle: vor dem ersten Kapitel mit größerer Zeit. So bleibt die
   * Liste sortiert, auch wenn mitten im Beitrag ein Kapitel nachgetragen
   * wird.
   */
  const laterEntry = existing.find((entry) => entry.start > seconds);
  const insertAtInner = laterEntry
    ? laterEntry.line - 1
    : lastNonEmptyIndex(inner) + 1;

  const newInner = [...inner];
  newInner.splice(insertAtInner, 0, newLine);

  const before = lines.slice(0, block.innerStartLine - 1);
  const after = lines.slice(block.closeLine - 1);
  const combined = [...before, ...newInner, ...after];

  const newLineIndex = before.length + insertAtInner;
  const titleStart =
    offsetOfLine(combined, newLineIndex) + time.length + 1;

  return {
    content: combined.join("\n"),
    selectionStart: titleStart,
    selectionEnd: titleStart + CHAPTER_PLACEHOLDER.length,
    note: `Kapitel bei ${time} eingefügt — Titel eintragen.`,
  };
}

/** Zeichenoffset, an dem die Zeile mit diesem Index beginnt. */
function offsetOfLine(lines: readonly string[], index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i += 1) offset += lines[i].length + 1;
  return offset;
}

function lastNonEmptyIndex(lines: readonly string[]): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim()) return i;
  }
  return -1;
}
