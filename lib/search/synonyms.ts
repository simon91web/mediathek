import { foldTerm, tokenize } from "./normalize";

/*
 * Bedeutungsnahe Suche ohne Embeddings.
 *
 * Die Themenseiten führen Synonyme ("Balancing", "Spannungsspreizung" für
 * "Zellspannungsmessung"). Steht ein solches Wort in der Anfrage, wird
 * zusätzlich nach den übrigen Wörtern derselben Gruppe gesucht. Wer
 * "Balancing" sucht, findet damit die Stelle, an der "Zellspannung" gesagt
 * wurde — ohne ein Modell im Browser des Kollegen und ohne einen zweiten
 * Index.
 *
 * Der Preis ist Ehrlichkeit: die Erweiterung ist nur so gut wie die
 * Themenseiten. Deshalb wird jeder erweiterte Treffer als solcher
 * gekennzeichnet, und die Trefferliste sagt, wonach zusätzlich gesucht
 * wurde. Eine stille Erweiterung wäre schlimmer als keine — man würde die
 * Fremdtreffer für eigene halten.
 *
 * Ohne "server-only": rein und damit direkt testbar.
 */

export type SynonymSource = {
  slug: string;
  title: string;
  synonyms: readonly string[];
};

/** Eine Wortgruppe: alle Schreibweisen, die dasselbe meinen. */
export type SynonymGroup = {
  topic: { slug: string; title: string };
  /** Wie geschrieben — für die Anzeige. */
  forms: string[];
  /** Gefaltet und in Token zerlegt — für den Vergleich. */
  tokens: string[][];
};

/** Wonach zusätzlich gesucht wird, und woher das kommt. */
export type Expansion = {
  /** Das zusätzliche Wort, wie es auf der Themenseite steht. */
  term: string;
  /** Gefaltete Form — der Suchbegriff für den wörtlichen Durchgang. */
  folded: string;
  topic: { slug: string; title: string };
};

/** Mehr als das wäre keine Präzisierung mehr, sondern Rauschen. */
const MAX_EXPANSIONS = 8;

export function buildSynonymGroups(
  topics: readonly SynonymSource[],
): SynonymGroup[] {
  const groups: SynonymGroup[] = [];

  for (const topic of topics) {
    /*
     * Der Titel gehört dazu: wer nach einem Synonym sucht, will auch die
     * Stellen finden, an denen das Thema mit seinem Namen benannt ist — und
     * umgekehrt.
     */
    const seen = new Set<string>();
    const forms: string[] = [];
    for (const form of [topic.title, ...topic.synonyms]) {
      const text = form.trim().replace(/\s+/g, " ");
      if (text.length < 3) continue;
      const key = foldTerm(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      forms.push(text);
    }

    // Eine Gruppe mit einer einzigen Form kann nichts erweitern.
    if (forms.length < 2) continue;

    groups.push({
      topic: { slug: topic.slug, title: topic.title },
      forms,
      tokens: forms.map((form) => tokenize(form).map(foldTerm)),
    });
  }

  return groups;
}

/** Kommt die Token-Folge `needle` in `haystack` vor? */
function containsSequence(
  haystack: readonly string[],
  needle: readonly string[],
): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    let hit = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * Wonach zusätzlich gesucht werden soll.
 *
 * Verglichen wird über **ganze Token**, nicht über Teilstrings: sonst würde
 * "Ah" in "fahren" eine Gruppe auslösen und die Trefferliste mit
 * Fremdmaterial fluten.
 */
export function expandQuery(
  query: { terms: readonly string[]; phrases: readonly string[] },
  groups: readonly SynonymGroup[],
): Expansion[] {
  const queryTokens = [
    ...query.terms,
    ...query.phrases.flatMap((phrase) => tokenize(phrase).map(foldTerm)),
  ].filter(Boolean);
  if (queryTokens.length === 0) return [];

  const expansions: Expansion[] = [];
  const used = new Set<string>(queryTokens.map((token) => token));

  for (const group of groups) {
    const matched = group.tokens.findIndex((tokens) =>
      containsSequence(queryTokens, tokens),
    );
    if (matched === -1) continue;

    for (let i = 0; i < group.forms.length; i += 1) {
      if (i === matched) continue;
      const folded = foldTerm(group.forms[i]);
      if (!folded || used.has(folded)) continue;
      used.add(folded);
      expansions.push({ term: group.forms[i], folded, topic: group.topic });
      if (expansions.length >= MAX_EXPANSIONS) return expansions;
    }
  }

  return expansions;
}
