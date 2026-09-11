import {
  lineOffset,
  parseItemFrontmatter,
  shiftProblems,
  shiftSourceLines,
  splitFrontmatter,
} from "./frontmatter";
import { humanizeSlug } from "./slug";
import { findWikilinks, parseSpotLines } from "./wikilink";
import type { ItemProblem, Slug, Spot } from "./types";

/*
 * Eine Sammlung ist ein geordneter Weg durch Ausschnitte — quer über
 * Beitragsgrenzen hinweg:
 *
 *   ---
 *   titel: Alles zum Akku
 *   ---
 *   Was ich einem neuen Kollegen zum Akku zeigen würde, in dieser Folge.
 *
 *   - [[akku-grundlagen#00:15-00:50]] Messen mit dem Zellprüfer
 *   - [[vorflugkontrolle-elios-3#00:30]] Im Ablauf der Vorflugkontrolle
 *   - [[messprotokoll-lesen#akku-und-spannung]] Wie es ins Protokoll kommt
 *
 * Mit `suche:` im Kopf wird daraus eine **gespeicherte Suche**, die bei
 * jedem Aufruf neu läuft:
 *
 *   ---
 *   titel: Überall, wo es um Spannung geht
 *   suche: zellspannung
 *   ---
 *
 * Der Unterschied ist bewusst: eine feste Liste ist eine Aussage ("in dieser
 * Reihenfolge"), eine gespeicherte Suche eine Frage ("was gibt es dazu?").
 * Beides steht in derselben Datei, und beides ist von Hand lesbar.
 *
 * Anders als bei Themen gibt es hier keinen Marker-Block: eine Sammlung ist
 * eine Entscheidung ihres Autors, nichts, was ein Sprachmodell nachträglich
 * umsortieren soll.
 */

/**
 * Ersetzt den Inhalt von HTML-Kommentaren durch Leerzeichen — Zeilenumbrüche
 * bleiben, damit sich keine Zeilennummer verschiebt.
 */
function blankComments(body: string): string {
  return body.replace(/<!--[\s\S]*?-->/g, (treffer) =>
    treffer.replace(/[^\n]/g, " "),
  );
}

export type ParsedCollection = {
  title: string;
  description: string;
  entries: Spot[];
  query: string | null;
  tags: string[];
  problems: ItemProblem[];
};

export function parseCollectionMarkdown(
  raw: string,
  slug: Slug,
): ParsedCollection {
  const split = splitFrontmatter(raw);
  const head = parseItemFrontmatter(split.frontmatterText);

  // Der Kopf zählt in der Datei, alles andere im Body — siehe ./frontmatter.
  const headProblems: ItemProblem[] = [...split.problems, ...head.problems];
  const problems: ItemProblem[] = [];

  /*
   * Die Verweiszeilen sind die Sammlung; die Reihenfolge der Datei ist die
   * Reihenfolge der Wiedergabe. Anders als bei Themen wird NICHT entdoppelt:
   * dieselbe Stelle darf zweimal auftauchen, wenn der Weg sie zweimal
   * braucht.
   *
   * Auskommentiertes zählt nicht.
   *
   * Eine Sammlung hat keine Marker-Blöcke, also ist ein HTML-Kommentar hier
   * genau das: eine Bemerkung. Ohne diesen Schritt würde eine als Beispiel
   * auskommentierte Zeile — und so eine legt die Mediathek beim Anlegen
   * selbst an — als echter Ausschnitt gelesen und zeigte auf einen Beitrag,
   * den niemand gemeint hat.
   *
   * Ausgeblendet statt entfernt, damit alle Zeilennummern gültig bleiben.
   */
  const ohneKommentare = blankComments(split.body);

  const { spots, problems: spotProblems } = parseSpotLines(ohneKommentare, 1);
  problems.push(...spotProblems);

  if (spots.length === 0 && !head.data.query) {
    problems.push({
      kind: "bezug",
      message:
        "Diese Sammlung ist leer. Erwartet werden Zeilen wie " +
        "[[akku-grundlagen#00:15-00:50]] — oder ein Feld " +
        '"suche:" im Kopf, dann wird sie bei jedem Aufruf neu gesucht.',
    });
  }

  const description = split.body
    .split("\n")
    .filter((line) => findWikilinks(line).length === 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const offset = lineOffset(split);

  return {
    title: head.data.title || humanizeSlug(slug),
    description,
    entries: shiftSourceLines(spots, offset),
    query: head.data.query,
    tags: head.data.tags,
    problems: [...headProblems, ...shiftProblems(problems, offset)],
  };
}
