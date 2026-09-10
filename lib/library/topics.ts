import {
  lineOffset,
  parseItemFrontmatter,
  shiftProblems,
  shiftSourceLines,
  splitFrontmatter,
} from "./frontmatter";
import { blankBlocks, findBlocks } from "./sections";
import { humanizeSlug } from "./slug";
import { findWikilinks, parseSpotLines } from "./wikilink";
import type { ItemProblem, Slug, Spot } from "./types";

/*
 * Ein Thema ist eine kleine Datei in themen/ — der Einstieg in ein
 * Wissensgebiet, nicht ein Kurs:
 *
 *   ---
 *   titel: Zellspannungsmessung
 *   synonyme: [Balancing, Spannungsspreizung, Zellprüfer]
 *   schlagworte: [akku]
 *   ---
 *   Zwei bis fünf Sätze, was dieses Gebiet ausmacht.
 *
 *   - [[vorflugkontrolle-elios-3]]
 *   - [[akku-grundlagen]] optional mit Anmerkung
 *
 *   <!-- fundstellen:start -->
 *   - [[akku-grundlagen#00:15]] Das Messgerät und der Ablauf
 *   - [[messprotokoll-lesen#akku-und-spannung]] Wie es ins Protokoll kommt
 *   <!-- fundstellen:ende -->
 *
 * Zwei Ebenen, ein Zweck. **Außerhalb** der Marker stehen ganze Beiträge in
 * der Reihenfolge, in der man sie ansehen würde — handgeschrieben. **Im**
 * Block stehen einzelne Stellen quer durch alles; das ist das Schreibfenster
 * für Claude Code. Arten dürfen sich mischen: ein Thema kann ein Video, ein
 * Sprachmemo und einen Text enthalten.
 *
 * Die Synonyme sind kein Beiwerk: sie erweitern die Suchanfrage und sind der
 * pragmatische Weg zu bedeutungsnaher Suche, ohne Embeddings und ohne eine
 * zusätzliche Abhängigkeit beim Kollegen.
 */

export type ParsedTopic = {
  title: string;
  description: string;
  itemSlugs: Slug[];
  synonyms: string[];
  spots: Spot[];
  tags: string[];
  problems: ItemProblem[];
};

export function parseTopicMarkdown(raw: string, slug: Slug): ParsedTopic {
  const split = splitFrontmatter(raw);
  const head = parseItemFrontmatter(split.frontmatterText);

  // Der Kopf zählt in der Datei, alles andere im Body — siehe ./frontmatter.
  const headProblems: ItemProblem[] = [...split.problems, ...head.problems];
  const problems: ItemProblem[] = [];

  const { blocks, problems: blockProblems } = findBlocks(split.body);
  problems.push(...blockProblems);

  /*
   * Fundstellen stehen im Marker-Block, die geordneten Beiträge außerhalb.
   * Der Block wird ausgeblendet statt entfernt (blankBlocks lässt alle
   * Zeilennummern gültig), damit Hinweise auf die richtige Zeile zeigen und
   * eine Fundstelle nicht doppelt als ganzer Beitrag zählt.
   */
  const outside = blankBlocks(split.body, blocks);

  const seen = new Set<Slug>();
  const itemSlugs: Slug[] = [];
  for (const link of findWikilinks(outside)) {
    if (seen.has(link.slug)) continue;
    seen.add(link.slug);
    itemSlugs.push(link.slug);
  }

  const spotBlock = blocks.get("fundstellen");
  const spotResult = spotBlock
    ? parseSpotLines(spotBlock.inner, spotBlock.innerStartLine)
    : { spots: [], problems: [] };
  problems.push(...spotResult.problems);

  if (itemSlugs.length === 0 && spotResult.spots.length === 0) {
    problems.push({
      kind: "bezug",
      message:
        "Dieses Thema nennt keine Beiträge. Erwartet werden Verweise wie " +
        "[[akku-pruefen]], deren Reihenfolge die Reihenfolge im Thema ist.",
    });
  }

  /*
   * Für die Beschreibung werden die Verweiszeilen entfernt: sie sind die
   * Inhaltsliste und werden von der Themenseite selbst dargestellt.
   */
  const description = outside
    .split("\n")
    .filter((line) => findWikilinks(line).length === 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const offset = lineOffset(split);

  return {
    title: head.data.title || humanizeSlug(slug),
    description,
    itemSlugs,
    synonyms: head.data.synonyms,
    spots: shiftSourceLines(spotResult.spots, offset),
    tags: head.data.tags,
    problems: [...headProblems, ...shiftProblems(problems, offset)],
  };
}
