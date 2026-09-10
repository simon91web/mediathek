import { parseItemFrontmatter, splitFrontmatter } from "./frontmatter";
import { humanizeSlug } from "./slug";
import { findWikilinks } from "./wikilink";
import type { ItemProblem, Slug } from "./types";

/*
 * Ein Thema ist eine kleine, handgeschriebene Datei in themen/. Die Reihenfolge
 * der Wikilinks im Text ist die Reihenfolge im Thema — es braucht keinen
 * Marker-Block, weil die Datei ohnehin nur aus dieser Liste besteht:
 *
 *   ---
 *   titel: Drohnen-Grundlagen
 *   schlagworte: [drohne]
 *   ---
 *   Was man nach diesem Thema kann.
 *
 *   - [[vorflugkontrolle-elios-3]]
 *   - [[akku-pruefen]] optional mit Anmerkung
 *
 * Arten dürfen sich mischen: ein Thema kann ein Video, ein Sprachmemo und
 * einen Text enthalten.
 */

export type ParsedTopic = {
  title: string;
  description: string;
  itemSlugs: Slug[];
  tags: string[];
  problems: ItemProblem[];
};

export function parseTopicMarkdown(raw: string, slug: Slug): ParsedTopic {
  const split = splitFrontmatter(raw);
  const head = parseItemFrontmatter(split.frontmatterText);
  const problems: ItemProblem[] = [...split.problems, ...head.problems];

  const seen = new Set<Slug>();
  const itemSlugs: Slug[] = [];
  for (const link of findWikilinks(split.body)) {
    if (seen.has(link.slug)) continue;
    seen.add(link.slug);
    itemSlugs.push(link.slug);
  }

  if (itemSlugs.length === 0) {
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
  const description = split.body
    .split("\n")
    .filter((line) => findWikilinks(line).length === 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    title: head.data.title || humanizeSlug(slug),
    description,
    itemSlugs,
    tags: head.data.tags,
    problems,
  };
}
