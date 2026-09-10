import "server-only";

import MiniSearch from "minisearch";

import { getLibrary } from "@/lib/library";
import { readAttachmentTexts } from "@/lib/library/attachment-text";
import { getTranscript } from "@/lib/library/transcript";
import type { Item, MediaKind, Slug } from "@/lib/library/types";
import {
  blocksFromAttachment,
  blocksFromText,
  blocksFromTranscript,
  metaTextOf,
} from "./blocks";
import type { Block } from "./blocks";
import { foldTerm, parseQuery, tokenize } from "./normalize";

/*
 * Volltextsuche über alles: Titel, Schlagworte, Beschreibungen,
 * Zusammenfassungen, Kapitelnamen, Transkripte und Textbeiträge.
 *
 * Zwei Kanäle, und das ist keine Umständlichkeit:
 *
 *   1. MiniSearch mit BM25-Rangfolge, Präfixen und Feld-Gewichtung. Findet
 *      "vorflug" in "Vorflugkontrolle", aber NICHT "kontrolle" — MiniSearch
 *      kennt keine Wortmitte. Bei deutschen Komposita ist genau das der
 *      wichtige Fall.
 *   2. Ein wörtlicher Teilstring-Durchgang über dieselben Blöcke. Der
 *      schließt die Lücke und ist bei Anfragen in Anführungszeichen der
 *      einzige zuständige Kanal.
 *
 * Beide Ergebnisse werden zusammengeführt und entdoppelt.
 */

export type SearchHitKind =
  | "anhang"
  | "titel"
  | "beschreibung"
  | "zusammenfassung"
  | "kapitel"
  | "transkript"
  | "text";

export type Snippet = {
  text: string;
  /**
   * Offsets in `text`, KEIN HTML. Bibliotheksinhalte sind Fremdtext, und
   * dangerouslySetInnerHTML verbietet sich dafür — die Komponente zerlegt
   * den Text an diesen Stellen und setzt selbst <mark>.
   */
  marks: Array<[start: number, end: number]>;
};

export type SearchHit = {
  slug: Slug;
  title: string;
  kind: MediaKind;
  hitKind: SearchHitKind;
  score: number;
  /** Sekunde bei Video und Audio … */
  start: number | null;
  /** … oder Abschnittsanker bei Textbeiträgen. */
  anchor: string | null;
  chapterTitle: string | null;
  /** Gesetzt, wenn der Treffer aus einem Anhang stammt. */
  attachment: { file: string; label: string } | null;
  snippet: Snippet;
  /** Fertige Zieladresse. */
  href: string;
};

export type SearchIndexStatus = {
  state: "leer" | "baut" | "fertig" | "abgebrochen";
  items: number;
  blocks: number;
  bytes: number;
  builtAtMs: number | null;
  /** Für welche Bibliotheks-Fassung der Index gilt. */
  generation: number;
  error: string | null;
};

type IndexedBlock = Block & { id: string; folded: string };

type SearchState = {
  generation: number;
  status: SearchIndexStatus;
  mini: MiniSearch<IndexedBlock> | null;
  blocks: IndexedBlock[];
  /** Blöcke aus Titel und Zusammenfassung — für die Trefferart. */
  metaIds: Set<string>;
  building: Promise<SearchIndexStatus> | null;
};

const globalForSearch = globalThis as unknown as {
  mediathekSearch?: SearchState;
};

const state: SearchState = (globalForSearch.mediathekSearch ??= {
  generation: -1,
  status: {
    state: "leer",
    items: 0,
    blocks: 0,
    bytes: 0,
    builtAtMs: null,
    generation: -1,
    error: null,
  },
  mini: null,
  blocks: [],
  metaIds: new Set(),
  building: null,
});

/**
 * Notbremse. Reißt die Grenze, bricht der Aufbau ab und die Suche fällt auf
 * den wörtlichen Durchgang zurück — langsamer, aber vollständig, und nie ein
 * überlaufender Speicher.
 */
const MAX_BYTES =
  Number(process.env.MEDIATHEK_SUCHE_MAX_MB ?? 400) * 1024 * 1024;

function makeMiniSearch(): MiniSearch<IndexedBlock> {
  return new MiniSearch<IndexedBlock>({
    fields: ["folded"],
    /*
     * Nur Kennung und Sprungziel werden im Index gehalten, NICHT der Text.
     * Das Snippet wird beim Anzeigen aus der Blockliste geholt. Ohne diese
     * Sparsamkeit landet der Index bei fünfhundert Beiträgen im
     * Gigabyte-Bereich.
     */
    storeFields: ["slug", "index", "start", "anchor", "chapterTitle"],
    idField: "id",
    processTerm: (term) => {
      const folded = foldTerm(term);
      return folded.length > 1 ? folded : null;
    },
    tokenize,
  });
}

async function blocksOf(item: Item): Promise<Block[]> {
  const blocks: Block[] = [];

  // Titel, Schlagworte, Kapitelnamen und Zusammenfassung immer zuerst.
  const meta = metaTextOf(item);
  if (meta.trim()) {
    blocks.push({
      slug: item.slug,
      index: -1,
      text: meta,
      start: null,
      anchor: null,
      chapterTitle: null,
    });
  }

  if (item.kind === "text") {
    blocks.push(...blocksFromText(item.slug, item.description, item.chapters));
    return blocks;
  }

  // Beschreibung eines Video- oder Audiobeitrags.
  if (item.description.trim()) {
    blocks.push({
      slug: item.slug,
      index: -2,
      text: item.description.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"),
      start: null,
      anchor: null,
      chapterTitle: null,
    });
  }

  if (item.hasTranscript) {
    const transcript = await getTranscript(item.slug);
    if (transcript) {
      blocks.push(
        ...blocksFromTranscript(item.slug, transcript.segments, item.chapters),
      );
    }
  }

  blocks.push(...(await attachmentBlocks(item)));
  return blocks;
}

/**
 * Der Text aus Anhängen — sofern er gezogen wurde.
 *
 * Zählt rückwärts ab -10, damit sich die Kennungen nicht mit den vorwärts
 * zählenden Transkript- und Textblöcken überschneiden.
 */
async function attachmentBlocks(item: Item): Promise<Block[]> {
  if (item.attachments.every((attachment) => !attachment.hasText)) return [];

  const texts = await readAttachmentTexts(item);
  const blocks: Block[] = [];
  let cursor = -10;
  for (const entry of texts) {
    const made = blocksFromAttachment(
      item.slug,
      { file: entry.file, label: entry.label },
      entry.text,
      cursor,
    );
    cursor -= Math.max(1, made.length);
    blocks.push(...made);
  }
  return blocks;
}

/** Baut den Index, falls er fehlt oder veraltet ist. */
export async function ensureSearchIndex(): Promise<SearchIndexStatus> {
  const library = await getLibrary();
  if (state.generation === library.generation && state.status.state === "fertig") {
    return state.status;
  }
  if (state.building) return state.building;

  const build = (async (): Promise<SearchIndexStatus> => {
    const startedAt = Date.now();
    state.status = {
      ...state.status,
      state: "baut",
      generation: library.generation,
      error: null,
    };

    const collected: IndexedBlock[] = [];
    const metaIds = new Set<string>();
    let bytes = 0;

    for (const item of library.items) {
      for (const block of await blocksOf(item)) {
        const id = `${block.slug}#${block.index}`;
        const entry: IndexedBlock = {
          ...block,
          id,
          folded: foldTerm(block.text),
        };
        bytes += block.text.length * 2 + entry.folded.length * 2;
        if (block.index < 0) metaIds.add(id);
        collected.push(entry);

        if (bytes > MAX_BYTES) {
          state.blocks = collected;
          state.metaIds = metaIds;
          state.mini = null;
          state.generation = library.generation;
          state.status = {
            state: "abgebrochen",
            items: library.items.length,
            blocks: collected.length,
            bytes,
            builtAtMs: Date.now(),
            generation: library.generation,
            error:
              "Der Suchindex würde zu groß. Es wird ohne Rangfolge gesucht, " +
              "dafür wörtlich und vollständig.",
          };
          return state.status;
        }
      }
    }

    const mini = makeMiniSearch();
    mini.addAll(collected);

    state.mini = mini;
    state.blocks = collected;
    state.metaIds = metaIds;
    state.generation = library.generation;
    state.status = {
      state: "fertig",
      items: library.items.length,
      blocks: collected.length,
      bytes,
      builtAtMs: Date.now(),
      generation: library.generation,
      error: null,
    };
    console.log(
      `[suche] ${collected.length} Blöcke aus ${library.items.length} ` +
        `Beiträgen in ${Date.now() - startedAt} ms`,
    );
    return state.status;
  })().finally(() => {
    state.building = null;
  });

  state.building = build;
  return build;
}

export function searchIndexStatus(): SearchIndexStatus {
  return state.status;
}

/** Wird beim Neu-Einlesen gerufen; der Index baut sich beim nächsten Zugriff neu. */
export function invalidateSearchIndex(): void {
  state.generation = -1;
  state.status = { ...state.status, state: "leer" };
}

// ─────────────────────────────────────────────────────────── Snippets

/** Fenster um den ersten Treffer, an Wortgrenzen geschnitten. */
function makeSnippet(text: string, needles: string[]): Snippet {
  const folded = foldTerm(text);
  const positions: Array<[number, number]> = [];

  for (const needle of needles) {
    if (!needle) continue;
    let from = 0;
    // Höchstens fünf Markierungen je Snippet — mehr liest niemand.
    while (positions.length < 5) {
      const at = folded.indexOf(needle, from);
      if (at === -1) break;
      positions.push([at, at + needle.length]);
      from = at + needle.length;
    }
  }
  positions.sort((a, b) => a[0] - b[0]);

  const first = positions[0]?.[0] ?? 0;
  let from = Math.max(0, first - 40);
  let to = Math.min(text.length, first + 180);

  // An Wortgrenzen schneiden, damit kein halbes Wort am Rand steht.
  if (from > 0) {
    const space = text.indexOf(" ", from);
    if (space !== -1 && space < first) from = space + 1;
  }
  if (to < text.length) {
    const space = text.lastIndexOf(" ", to);
    if (space > first) to = space;
  }

  const cut = text.slice(from, to);
  const prefix = from > 0 ? "… " : "";
  const suffix = to < text.length ? " …" : "";

  const marks: Array<[number, number]> = [];
  for (const [start, end] of positions) {
    if (start < from || end > to) continue;
    marks.push([start - from + prefix.length, end - from + prefix.length]);
  }

  return { text: `${prefix}${cut}${suffix}`, marks };
}

/**
 * Verfeinert ein Zeitziel innerhalb eines Blocks.
 *
 * Ohne diesen Schritt landet man bis zu dreißig Sekunden zu früh: der Block
 * beginnt beim ersten Segment, der Suchbegriff kann aber am Ende stehen.
 */
async function refineStart(
  slug: string,
  blockStart: number,
  needles: string[],
): Promise<number> {
  const transcript = await getTranscript(slug);
  if (!transcript) return blockStart;

  for (const segment of transcript.segments) {
    if (segment.end < blockStart) continue;
    const folded = foldTerm(segment.text);
    if (needles.some((needle) => needle && folded.includes(needle))) {
      return Math.max(0, Math.floor(segment.start));
    }
    // Nicht weiter als bis zum Blockende suchen.
    if (segment.start > blockStart + 40) break;
  }
  return blockStart;
}

function hitKindOf(block: IndexedBlock, item: Item): SearchHitKind {
  if (block.attachment) return "anhang";
  if (block.index === -1) return "titel";
  if (block.index === -2) return "beschreibung";
  if (item.kind === "text") return "text";
  return "transkript";
}

export type SearchOptions = {
  limit?: number;
  kinds?: readonly MediaKind[];
  tags?: readonly string[];
};

export type SearchResult = {
  hits: SearchHit[];
  total: number;
  tookMs: number;
  /** true, wenn ohne Rangfolge gesucht wurde (Index abgebrochen). */
  degraded: boolean;
  status: SearchIndexStatus;
};

export async function search(
  rawQuery: string,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const startedAt = Date.now();
  const status = await ensureSearchIndex();
  const library = await getLibrary();
  const limit = options.limit ?? 40;

  const { terms, phrases } = parseQuery(rawQuery);
  const needles = [...phrases.map(foldTerm), ...terms].filter(Boolean);

  if (needles.length === 0) {
    return { hits: [], total: 0, tookMs: 0, degraded: false, status };
  }

  const scores = new Map<string, number>();

  // Kanal 1: MiniSearch — Rangfolge und Präfixe.
  if (state.mini && phrases.length === 0) {
    for (const result of state.mini.search(terms.join(" "), {
      prefix: true,
      fuzzy: 0.2,
      combineWith: "AND",
    })) {
      scores.set(String(result.id), result.score);
    }
  }

  /*
   * Kanal 2: wörtlich. Fängt die Wortmitte deutscher Komposita, die
   * MiniSearch nicht findet — und ist bei Anfragen in Anführungszeichen der
   * einzige zuständige Kanal.
   */
  for (const block of state.blocks) {
    const all = needles.every((needle) => block.folded.includes(needle));
    if (!all) continue;
    // Etwas unter den BM25-Werten einsortieren, aber immer über null.
    const existing = scores.get(block.id) ?? 0;
    scores.set(block.id, Math.max(existing, 0.5));
  }

  const byId = new Map(state.blocks.map((block) => [block.id, block]));
  const wantedKinds = options.kinds?.length ? new Set(options.kinds) : null;
  const wantedTags = options.tags?.length ? options.tags : null;

  const ranked = [...scores.entries()]
    .map(([id, score]) => ({ block: byId.get(id), score }))
    .filter(
      (entry): entry is { block: IndexedBlock; score: number } =>
        entry.block !== undefined,
    )
    .sort((a, b) => b.score - a.score);

  const hits: SearchHit[] = [];
  const seen = new Set<string>();

  for (const entry of ranked) {
    if (hits.length >= limit) break;
    const item = library.bySlug.get(entry.block.slug);
    if (!item) continue;
    if (wantedKinds && !wantedKinds.has(item.kind)) continue;
    if (wantedTags && !wantedTags.every((tag) => item.tags.includes(tag))) {
      continue;
    }

    const hitKind = hitKindOf(entry.block, item);
    const start =
      entry.block.start !== null
        ? await refineStart(item.slug, entry.block.start, needles)
        : null;

    // Ein Beitrag soll die Liste nicht mit zwanzig Stellen zulaufen lassen:
    // dieselbe Stelle nur einmal, und je Beitrag höchstens drei Treffer.
    const key = `${item.slug}|${start ?? entry.block.anchor ?? hitKind}`;
    if (seen.has(key)) continue;
    const perItem = hits.filter((hit) => hit.slug === item.slug).length;
    if (perItem >= 3) continue;
    seen.add(key);

    hits.push({
      slug: item.slug,
      title: item.title,
      kind: item.kind,
      hitKind,
      score: entry.score,
      start,
      anchor: entry.block.anchor,
      chapterTitle: entry.block.chapterTitle,
      attachment: entry.block.attachment ?? null,
      snippet: makeSnippet(entry.block.text, needles),
      /*
       * Ein Treffer im Anhang führt zum Beitrag; der Anhang selbst wird in
       * der Trefferzeile genannt. Direkt auf die PDF-Adresse zu verweisen
       * hieße, den Zusammenhang zu verlieren, in dem das Handout steht.
       */
      href:
        start !== null
          ? `/medien/${item.slug}?t=${start}`
          : entry.block.anchor
            ? `/medien/${item.slug}#${entry.block.anchor}`
            : `/medien/${item.slug}`,
    });
  }

  return {
    hits,
    total: scores.size,
    tookMs: Date.now() - startedAt,
    degraded: status.state === "abgebrochen",
    status,
  };
}
