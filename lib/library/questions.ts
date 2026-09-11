import {
  lineOffset,
  parseItemFrontmatter,
  shiftProblems,
  shiftSourceLines,
  splitFrontmatter,
} from "./frontmatter";
import { blankBlocks, findBlocks } from "./sections";
import { humanizeSlug } from "./slug";
import { findWikilinks } from "./wikilink";
import type { ItemProblem, Slug, Spot } from "./types";

/*
 * Eine Frage mit ihrer Antwort — eine Datei in fragen/:
 *
 *   ---
 *   frage: Wie lese ich die Trajectory-Datei?
 *   auch gefragt:
 *     - Was steht eigentlich in der Trajectory?
 *     - Trajectory-Spalten, was bedeuten die?
 *   gefragt: 2026-09-11
 *   quellen: [bibliothek]
 *   ---
 *
 *   <!-- antwort:start -->
 *   Die Trajectory enthält Position und Rotation je Zeitstempel; der
 *   Zeitstempel beginnt nicht bei null [[cloud-compare-1#04:25]].
 *   <!-- antwort:ende -->
 *
 * Das ist der Boden des FAQ: der Chat schreibt jede beantwortete Frage
 * hierher, und aus dem Haufen wird nach und nach ein geordneter Bestand.
 *
 * DREI FESTLEGUNGEN:
 *
 * 1. **Die Antwort steht im Marker-Block.** Das ist dasselbe Schreibfenster
 *    wie bei Kapiteln und Fundstellen: das Zusammenfassen mehrerer Fragen
 *    darf die Antwort neu schreiben und muss dafür nichts anderes anfassen.
 *    Fehlt der Block (von Hand angelegte Datei), gilt der ganze Body als
 *    Antwort — eine Frage ohne Marker soll nicht leer wirken.
 *
 * 2. **Belege sind Wikilinks IM Fließtext**, nicht eine Liste darunter.
 *    `[[cloud-compare-1#04:25]]` mitten im Satz wird zum Sprung ins Video an
 *    genau diese Stelle. Deshalb hier auch kein `parseSpotLines`: das liest
 *    zeilenweise, und eine Antwort ist Prosa.
 *
 * 3. **`auch gefragt` ist das Gegenstück zu den Synonymen einer
 *    Themenseite.** Beim Zusammenfassen wandern die anderen Formulierungen
 *    dorthin, statt gelöscht zu werden — sonst fände die zweite Fassung
 *    derselben Frage ihre Antwort nicht wieder.
 */

export type ParsedQuestion = {
  question: string;
  alsoAsked: string[];
  /** Der Antworttext, roh — mit den Wikilinks, wie sie dastehen. */
  answer: string;
  /** Die Belege aus dem Antworttext, in der Reihenfolge ihres Auftretens. */
  spots: Spot[];
  askedAt: string | null;
  /** true, wenn beim Beantworten auch das Internet gelesen wurde. */
  usedWeb: boolean;
  tags: string[];
  problems: ItemProblem[];
};

/** Der Marker-Block, in den ein Werkzeug schreiben darf. */
export const ANSWER_BLOCK = "antwort";

export function parseQuestionMarkdown(raw: string, slug: Slug): ParsedQuestion {
  const split = splitFrontmatter(raw);
  const head = parseItemFrontmatter(split.frontmatterText);

  // Der Kopf zählt in der Datei, alles andere im Body — siehe ./frontmatter.
  const headProblems: ItemProblem[] = [...split.problems, ...head.problems];
  const problems: ItemProblem[] = [];

  const { blocks, problems: blockProblems } = findBlocks(split.body);
  problems.push(...blockProblems);

  const block = blocks.get(ANSWER_BLOCK);
  /*
   * Ohne Marker gilt der ganze Body. Die Zeile, ab der gezählt wird, muss
   * trotzdem stimmen: ein Hinweis auf einen kaputten Verweis soll in den
   * Editor führen und nicht irgendwohin.
   */
  const answerStartLine = block ? block.innerStartLine : 1;
  const answerText = block ? block.inner : blankBlocks(split.body, blocks);
  const answer = answerText.replace(/\s+$/, "").replace(/^\n+/, "");

  if (!answer.trim()) {
    problems.push({
      kind: "bezug",
      message:
        "Auf diese Frage steht keine Antwort. Erwartet wird ein Block " +
        `zwischen <!-- ${ANSWER_BLOCK}:start --> und ` +
        `<!-- ${ANSWER_BLOCK}:ende -->.`,
      line: answerStartLine,
    });
  }

  /*
   * Die Belege. Gezählt wird die Zeile innerhalb des Antworttextes, damit der
   * Hinweis auf einen Verweis ins Leere in die richtige Zeile zeigt.
   */
  const spots: Spot[] = [];
  const seen = new Set<string>();
  const lines = answerText.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    for (const link of findWikilinks(lines[i])) {
      const key = `${link.slug}|${JSON.stringify(link.target)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      spots.push({
        slug: link.slug,
        target: link.target,
        note: "",
        sourceLine: answerStartLine + i,
      });
    }
  }

  const offset = lineOffset(split);

  return {
    question: head.data.title || humanizeSlug(slug),
    alsoAsked: head.data.alsoAsked,
    answer,
    spots: shiftSourceLines(spots, offset),
    askedAt: head.data.recorded,
    usedWeb: head.data.sources.includes("web"),
    tags: head.data.tags,
    problems: [...headProblems, ...shiftProblems(problems, offset)],
  };
}
