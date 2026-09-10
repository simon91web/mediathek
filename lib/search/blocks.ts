import type {
  Chapter,
  Item,
  TranscriptSegment,
} from "@/lib/library/types";

/*
 * Der durchsuchbare Text eines Beitrags, in Blöcke geschnitten.
 *
 * Indiziert werden BLÖCKE, nicht Einzelsegmente. Ein 90-Minuten-Beitrag hat
 * schnell tausend Transkriptsegmente; bei fünfhundert Beiträgen wären das
 * eine halbe Million Dokumente. Blöcke von etwa vierzig Wörtern bringen den
 * Faktor zehn heraus, ohne die Trefferqualität zu kosten — innerhalb des
 * Blocks wird die genaue Sekunde nachher aus den Segmenten bestimmt.
 */

/** Zielgröße eines Blocks in Wörtern. */
const TARGET_WORDS = 40;
/** Harte Obergrenze in Sekunden, damit ein Sprungziel nicht zu grob wird. */
const MAX_SECONDS = 30;

export type Block = {
  slug: string;
  /** Eindeutig innerhalb des Beitrags. */
  index: number;
  text: string;
  /** Sprungziel: Sekunde bei Video und Audio … */
  start: number | null;
  /** … oder Abschnittsanker bei Textbeiträgen. */
  anchor: string | null;
  /** Titel des Kapitels bzw. Abschnitts, in dem der Block liegt. */
  chapterTitle: string | null;
  /** Gesetzt, wenn der Text aus einem Anhang stammt. */
  attachment?: { file: string; label: string };
};

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** In welchem Zeitkapitel liegt diese Sekunde? */
function chapterAt(chapters: readonly Chapter[], seconds: number): string | null {
  let found: string | null = null;
  for (const chapter of chapters) {
    if (chapter.kind !== "zeit") continue;
    if (chapter.start <= seconds) found = chapter.title;
    else break;
  }
  return found;
}

/**
 * Blöcke aus einem Transkript.
 *
 * Geschnitten wird an Kapitelgrenzen: ein Block, der über einen
 * Kapitelwechsel reicht, würde in der Trefferliste dem falschen Kapitel
 * zugeschlagen.
 */
export function blocksFromTranscript(
  slug: string,
  segments: readonly TranscriptSegment[],
  chapters: readonly Chapter[],
): Block[] {
  const blocks: Block[] = [];
  let current: TranscriptSegment[] = [];
  let index = 0;

  const flush = () => {
    if (current.length === 0) return;
    const start = current[0].start;
    blocks.push({
      slug,
      index: index++,
      text: current.map((segment) => segment.text).join(" "),
      start,
      anchor: null,
      chapterTitle: chapterAt(chapters, start),
    });
    current = [];
  };

  for (const segment of segments) {
    if (current.length > 0) {
      const words = countWords(current.map((s) => s.text).join(" "));
      const span = segment.end - current[0].start;
      const chapterChanged =
        chapterAt(chapters, current[0].start) !== chapterAt(chapters, segment.start);
      if (words >= TARGET_WORDS || span > MAX_SECONDS || chapterChanged) {
        flush();
      }
    }
    current.push(segment);
  }
  flush();

  return blocks;
}

/**
 * Blöcke aus einem Textbeitrag.
 *
 * Geschnitten wird an den Überschriften; der Anker des jeweiligen Abschnitts
 * ist das Sprungziel. Innerhalb eines langen Abschnitts wird nach Absätzen
 * weiter zerlegt, damit ein Treffer nicht auf zehn Bildschirmseiten zeigt.
 */
export function blocksFromText(
  slug: string,
  body: string,
  chapters: readonly Chapter[],
): Block[] {
  const sections = chapters.filter(
    (chapter): chapter is Extract<Chapter, { kind: "abschnitt" }> =>
      chapter.kind === "abschnitt",
  );

  const lines = body.split("\n");
  const blocks: Block[] = [];
  let index = 0;

  let anchor: string | null = null;
  let chapterTitle: string | null = null;
  let sectionCursor = 0;
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer
      .join(" ")
      // Markdown-Auszeichnung entfernen: sie stört den Index und das Snippet.
      .replace(/`{1,3}[^`]*`{1,3}/g, " ")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[\[([^\]|#]+)(?:#[^\]]*)?\]\]/g, "$1")
      .replace(/[*_>#|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    buffer = [];
    if (text.length < 3) return;
    blocks.push({
      slug,
      index: index++,
      text,
      start: null,
      anchor,
      chapterTitle,
    });
  };

  for (const line of lines) {
    const heading = /^ {0,3}(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      // Die Anker stehen in Dokumentreihenfolge in `chapters`.
      const section = sections[sectionCursor++];
      anchor = section?.anchor ?? null;
      chapterTitle = section?.title ?? heading[2].trim();
      continue;
    }
    if (!line.trim()) {
      // Ein Absatzende ist eine gute Blockgrenze, sobald genug Text da ist.
      if (countWords(buffer.join(" ")) >= TARGET_WORDS) flush();
      continue;
    }
    buffer.push(line.trim());
    if (countWords(buffer.join(" ")) >= TARGET_WORDS * 2) flush();
  }
  flush();

  return blocks;
}

/**
 * Blöcke aus dem Text eines Anhangs.
 *
 * Ein Handout, das nur als PDF am Beitrag hängt, wäre sonst für die Suche
 * unsichtbar — und dort steht oft, was im Gesprochenen nur angerissen wird.
 */
export function blocksFromAttachment(
  slug: string,
  attachment: { file: string; label: string },
  text: string,
  startIndex: number,
): Block[] {
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let index = startIndex;

  const flush = () => {
    const joined = buffer.join(" ").replace(/\s+/g, " ").trim();
    buffer = [];
    if (joined.length < 3) return;
    blocks.push({
      slug,
      /*
       * Rückwärts zählend ab startIndex. Die Blöcke aus Transkript und Text
       * zählen vorwärts ab 0 — so können sich die Kennungen nicht
       * überschneiden, ohne dass beide Seiten voneinander wissen müssen.
       */
      index: index--,
      text: joined,
      start: null,
      anchor: null,
      chapterTitle: attachment.label,
      attachment,
    });
  };

  for (const line of text.split("\n")) {
    if (!line.trim()) {
      if (countWords(buffer.join(" ")) >= TARGET_WORDS) flush();
      continue;
    }
    buffer.push(line.trim());
    if (countWords(buffer.join(" ")) >= TARGET_WORDS * 2) flush();
  }
  flush();

  return blocks;
}

/**
 * Titel, Schlagworte, Kapitelnamen, Zusammenfassung und die Beschriftungen
 * der Anhänge — immer im Index, unabhängig von Transkript und Auszügen.
 *
 * Die Anhangsbeschriftungen gehören dazu, weil sie Simons eigener Text sind:
 * wer „Prüfzettel zum Ausdrucken" schreibt, will das auch wiederfinden, ohne
 * dass vorher jemand den PDF-Text ziehen musste.
 */
export function metaTextOf(item: Item): string {
  const parts: string[] = [item.title, ...item.tags];
  if (item.summary) parts.push(item.summary);
  for (const chapter of item.chapters) {
    parts.push(chapter.title);
    if (chapter.summary) parts.push(chapter.summary);
  }
  for (const attachment of item.attachments) {
    parts.push(attachment.label, attachment.file);
  }
  return parts.filter(Boolean).join(" \n ");
}
