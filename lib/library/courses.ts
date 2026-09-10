import { parseItemFrontmatter, splitFrontmatter } from "./frontmatter";
import { humanizeSlug } from "./slug";
import { findWikilinks } from "./wikilink";
import type { ItemProblem, Slug } from "./types";

/*
 * Ein Kurs ist eine kleine, handgeschriebene Datei in kurse/. Die Reihenfolge
 * der Wikilinks im Text ist die Kursreihenfolge — es braucht keinen
 * Marker-Block, weil die Datei ohnehin nur aus dieser Liste besteht:
 *
 *   ---
 *   titel: Drohnen-Grundlagen
 *   schlagworte: [drohne]
 *   ---
 *   Was man nach diesem Kurs kann.
 *
 *   - [[vorflugkontrolle-elios-3]]
 *   - [[akku-pruefen]] optional mit Anmerkung
 *
 * Arten dürfen sich mischen: ein Kurs kann ein Video, ein Sprachmemo und
 * einen Text enthalten.
 */

export type ParsedCourse = {
  title: string;
  description: string;
  itemSlugs: Slug[];
  tags: string[];
  problems: ItemProblem[];
};

export function parseCourseMarkdown(raw: string, slug: Slug): ParsedCourse {
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
        "Dieser Kurs nennt keine Beiträge. Erwartet werden Verweise wie " +
        "[[akku-pruefen]], deren Reihenfolge die Kursreihenfolge ist.",
    });
  }

  /*
   * Für die Beschreibung werden die Verweiszeilen entfernt: sie sind die
   * Inhaltsliste und werden von der Kursseite selbst dargestellt.
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
