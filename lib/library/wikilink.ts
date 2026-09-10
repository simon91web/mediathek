import { formatTimecode, parseTimecode } from "./chapters";
import { isSlug } from "./slug";
import type { ItemProblem, LinkTarget, Reference, Slug } from "./types";

/*
 * Eine Verweisform für alles: Bezüge unter einem Beitrag, Fundstellen einer
 * Themenseite und Einträge einer Sammlung.
 *
 *   [[akku-pruefen]]               der ganze Beitrag
 *   [[akku-pruefen#12:40]]         eine Stelle im Video oder Sprachmemo
 *   [[akku-pruefen#12:40-18:05]]   ein Ausschnitt
 *   [[messprotokoll#fehlerbilder]] ein Abschnitt in einem Textbeitrag
 *
 * Ob das Fragment eine Zeit oder ein Anker ist, entscheidet allein seine
 * Form — nicht die Art des Ziels. So lässt sich ein Verweis schreiben, ohne
 * das Ziel nachzuschlagen.
 */

const WIKILINK = /\[\[([^\]|#]+)(?:#([^\]|]+))?\]\]/g;

export type ParsedWikilink = {
  slug: Slug;
  target: LinkTarget;
  /** Zeichenoffset im übergebenen Text. */
  index: number;
  length: number;
  raw: string;
};

/** Erkennt "12:40" und "12:40-18:05" als Zeitfragment. */
function parseFragment(fragment: string | undefined): LinkTarget | null {
  if (!fragment) return { kind: "ganz" };
  const text = fragment.trim();
  if (!text) return { kind: "ganz" };

  const span = /^(\d{1,3}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,3}:\d{2}(?::\d{2})?)$/.exec(
    text,
  );
  if (span) {
    const start = parseTimecode(span[1]);
    const end = parseTimecode(span[2]);
    if (start !== null && end !== null && end > start) {
      return { kind: "zeit", start, end };
    }
    return null;
  }

  const single = parseTimecode(text);
  if (single !== null) return { kind: "zeit", start: single, end: null };

  // Alles andere ist ein Abschnittsanker.
  if (/^[a-z0-9][a-z0-9-]*$/.test(text)) {
    return { kind: "abschnitt", anchor: text };
  }
  return null;
}

export function findWikilinks(text: string): ParsedWikilink[] {
  const found: ParsedWikilink[] = [];
  WIKILINK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK.exec(text)) !== null) {
    const slug = match[1].trim();
    if (!isSlug(slug)) continue;
    const target = parseFragment(match[2]);
    if (!target) continue;
    found.push({
      slug,
      target,
      index: match.index,
      length: match[0].length,
      raw: match[0],
    });
  }
  return found;
}

export function formatWikilink(slug: Slug, target: LinkTarget): string {
  switch (target.kind) {
    case "ganz":
      return `[[${slug}]]`;
    case "abschnitt":
      return `[[${slug}#${target.anchor}]]`;
    case "zeit":
      return target.end === null
        ? `[[${slug}#${formatTimecode(target.start)}]]`
        : `[[${slug}#${formatTimecode(target.start)}-${formatTimecode(target.end)}]]`;
  }
}

/** Die fertige Ziel-Adresse innerhalb der Mediathek. */
export function referenceHref(slug: Slug, target: LinkTarget): string {
  switch (target.kind) {
    case "ganz":
      return `/medien/${slug}`;
    case "abschnitt":
      return `/medien/${slug}#${target.anchor}`;
    case "zeit":
      return `/medien/${slug}?t=${target.start}`;
  }
}

/**
 * Liest den Block "bezuege". Erwartet je Zeile einen Wikilink und dahinter
 * eine Zeile Begründung:
 *
 *   - [[messprotokoll-lesen#03:15]] Dasselbe Fehlerbild aus anderer Richtung
 */
export function parseReferenceLines(
  inner: string,
  innerStartLine: number,
  from: Slug,
): { references: Reference[]; problems: ItemProblem[] } {
  const references: Reference[] = [];
  const problems: ItemProblem[] = [];
  const lines = inner.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;

    const links = findWikilinks(line);
    if (links.length === 0) {
      // Eine Zeile mit Text, aber ohne Verweis: wahrscheinlich ein Tippfehler
      // in den doppelten Klammern.
      if (/\[\[|\]\]/.test(line)) {
        problems.push({
          kind: "bezug",
          message:
            "In dieser Zeile steht kein gültiger Verweis. Erwartet wird " +
            "zum Beispiel [[akku-pruefen#12:40]].",
          line: innerStartLine + i,
        });
      }
      continue;
    }

    const link = links[0];
    if (link.slug === from) {
      problems.push({
        kind: "bezug",
        message: "Ein Beitrag kann nicht auf sich selbst verweisen.",
        line: innerStartLine + i,
      });
      continue;
    }

    // Alles hinter dem Verweis ist die Begründung.
    const note = line
      .slice(link.index + link.length)
      .replace(/^\s*[-–—:|·]?\s*/, "")
      .trim();

    references.push({
      from,
      to: link.slug,
      target: link.target,
      note,
      sourceLine: innerStartLine + i,
    });
  }

  return { references, problems };
}

/** Eine Bezugszeile so schreiben, wie der Parser sie wieder einliest. */
export function formatReferenceLine(reference: Reference): string {
  const link = formatWikilink(reference.to, reference.target);
  return reference.note ? `- ${link} ${reference.note}` : `- ${link}`;
}
