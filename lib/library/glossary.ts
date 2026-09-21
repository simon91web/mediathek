import {
  lineOffset,
  parseItemFrontmatter,
  shiftProblems,
  shiftSourceLines,
  splitFrontmatter,
} from "./frontmatter";
import { blankBlocks, findBlocks } from "./sections";
import { humanizeSlug } from "./slug";
import { parseSpotLines } from "./wikilink";
import type { ItemProblem, Slug, Spot } from "./types";

/*
 * Ein Begriff ist eine kleine Datei in glossar/ — anders als ein Thema keine
 * geordnete Liste von Beiträgen, sondern eine kurze Definition plus
 * Fundstellen:
 *
 *   ---
 *   begriff: Erka-Control
 *   schreibweisen: [Erko-Control, erka control]
 *   ---
 *   Zwei bis drei Sätze, was der Begriff bedeutet. Darf [[wikilinks]] auf
 *   Beiträge und auf andere Begriffe enthalten.
 *
 *   <!-- fundstellen:start -->
 *   - [[akku-grundlagen#00:15]] Erwähnt im Zusammenhang mit der Zellprüfung
 *   <!-- fundstellen:ende -->
 *
 * schreibweisen ist kein Beiwerk: es erweitert die Suchanfrage genau wie
 * Themen-Synonyme (lib/search/synonyms.ts) UND speist glossar.txt — aber nur
 * mit dem kanonischen Begriff, nie mit den falschen Schreibweisen, sonst
 * würde Whisper künftig erst recht auf die falsche Form gewichtet.
 */

export type ParsedGlossaryEntry = {
  begriff: string;
  description: string;
  schreibweisen: string[];
  spots: Spot[];
  problems: ItemProblem[];
};

export function parseGlossaryMarkdown(
  raw: string,
  slug: Slug,
): ParsedGlossaryEntry {
  const split = splitFrontmatter(raw);
  const head = parseItemFrontmatter(split.frontmatterText);

  const headProblems: ItemProblem[] = [...split.problems, ...head.problems];
  const problems: ItemProblem[] = [];

  const { blocks, problems: blockProblems } = findBlocks(split.body);
  problems.push(...blockProblems);

  // Anders als bei Themen ist ALLES außerhalb der Marker die Definition —
  // keine Liste von Verweiszeilen, die herausgefiltert werden müsste.
  const description = blankBlocks(split.body, blocks).trim();

  const spotBlock = blocks.get("fundstellen");
  const spotResult = spotBlock
    ? parseSpotLines(spotBlock.inner, spotBlock.innerStartLine)
    : { spots: [], problems: [] };
  problems.push(...spotResult.problems);

  const offset = lineOffset(split);

  return {
    begriff: head.data.title || humanizeSlug(slug),
    description,
    schreibweisen: head.data.synonyms,
    spots: shiftSourceLines(spotResult.spots, offset),
    problems: [...headProblems, ...shiftProblems(problems, offset)],
  };
}
