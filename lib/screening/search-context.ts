import "server-only";

import { search } from "@/lib/search";
import type { JudgeCandidate } from "./judge";

/*
 * Ein paar Stichwort-Anfragen aus dem Kurztranskript, um Kandidaten aus dem
 * vorhandenen Suchindex zu holen — keine neue Ähnlichkeitssuche, keine
 * Embeddings (laut AGENTS.md bewusst zurückgestellt). Der KI-Assistent
 * bekommt diese Kandidaten als Kontext und urteilt selbst; hier geht es nur
 * darum, ihm nicht die ganze Bibliothek vorzulesen.
 */

const STOPWORDS = new Set([
  "der",
  "die",
  "das",
  "und",
  "oder",
  "ist",
  "sind",
  "war",
  "waren",
  "ein",
  "eine",
  "einen",
  "einer",
  "eines",
  "nicht",
  "mit",
  "auch",
  "auf",
  "für",
  "von",
  "den",
  "dem",
  "des",
  "im",
  "in",
  "zu",
  "zum",
  "zur",
  "an",
  "am",
  "als",
  "bei",
  "aber",
  "man",
  "wir",
  "ich",
  "du",
  "sie",
  "er",
  "es",
  "das",
  "hier",
  "jetzt",
  "dann",
  "also",
  "noch",
  "schon",
  "mal",
  "so",
  "wie",
  "was",
  "wenn",
  "kann",
  "muss",
  "wird",
  "haben",
  "hat",
  "sein",
  "über",
  "durch",
  "nach",
  "vor",
  "aus",
  "um",
]);

function extractKeywords(text: string, max: number): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-zäöüß0-9-]+/)) {
    const word = raw.trim();
    if (word.length < 4 || STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);
}

export async function findSearchCandidates(
  transcriptExcerpt: string,
  limit = 5,
): Promise<JudgeCandidate[]> {
  const keywords = extractKeywords(transcriptExcerpt, 8);
  if (keywords.length === 0) return [];

  const result = await search(keywords.join(" "), { limit: limit * 2 });
  const seen = new Set<string>();
  const candidates: JudgeCandidate[] = [];
  for (const hit of result.hits) {
    if (seen.has(hit.slug)) continue;
    seen.add(hit.slug);
    candidates.push({
      slug: hit.slug,
      title: hit.title,
      snippet: hit.snippet.text.slice(0, 160),
    });
    if (candidates.length >= limit) break;
  }
  return candidates;
}
