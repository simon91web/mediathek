import { describe, expect, it } from "vitest";

import { buildGraph, neighborhoodOf } from "./graph";
import type {
  Collection,
  GlossaryEntry,
  Item,
  LibraryState,
  Question,
  Topic,
} from "./types";

/*
 * Der Graph zieht aus fünf verschiedenen Dateiarten Kanten — Bezüge,
 * geordnete Beiträge, Fundstellen, Begriff-zu-Begriff-Wikilinks, Tags. Diese
 * Tests halten fest, dass jede Art tatsächlich eine Kante ergibt, dass ein
 * Verweis ins Leere keine Kante wird, und dass eine Kante nie doppelt
 * gezählt wird, nur weil sie von zwei Seiten genannt wurde.
 */

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    slug: "beitrag-1",
    kind: "video",
    title: "Beitrag 1",
    tags: [],
    recorded: null,
    durationSeconds: 90,
    description: "Eine Beschreibung.",
    chapters: [],
    summary: null,
    references: [],
    attachments: [],
    hasTranscript: false,
    transcriptSegmentCount: null,
    assets: {
      dir: "",
      markdownFile: "",
      mediaFile: null,
      mediaName: null,
      mediaBytes: null,
      mediaMime: null,
      posterFile: null,
      transcriptJsonFile: null,
      transcriptVttFile: null,
      attachmentsDir: null,
    },
    problems: [],
    fingerprint: { markdown: null, media: null, poster: null, transcript: null, attachments: null },
    addedAtMs: 0,
    changedAtMs: 0,
    ...overrides,
  };
}

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    slug: "thema-1",
    title: "Thema 1",
    description: "",
    itemSlugs: [],
    missingSlugs: [],
    synonyms: [],
    spots: [],
    tags: [],
    changedAtMs: 0,
    problems: [],
    ...overrides,
  };
}

function makeGlossaryEntry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    slug: "begriff-1",
    begriff: "Begriff 1",
    description: "",
    schreibweisen: [],
    spots: [],
    changedAtMs: 0,
    problems: [],
    ...overrides,
  };
}

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    slug: "sammlung-1",
    title: "Sammlung 1",
    description: "",
    entries: [],
    missingSlugs: [],
    query: null,
    tags: [],
    changedAtMs: 0,
    problems: [],
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    slug: "frage-1",
    question: "Eine Frage?",
    alsoAsked: [],
    answer: "",
    spots: [],
    missingSlugs: [],
    askedAt: null,
    usedWeb: false,
    tags: [],
    changedAtMs: 0,
    problems: [],
    ...overrides,
  };
}

function makeLibrary(parts: {
  items?: Item[];
  topics?: Topic[];
  glossary?: GlossaryEntry[];
  collections?: Collection[];
  questions?: Question[];
}): LibraryState {
  const items = parts.items ?? [];
  const topics = parts.topics ?? [];
  const glossary = parts.glossary ?? [];
  const collections = parts.collections ?? [];
  const questions = parts.questions ?? [];

  return {
    generation: 1,
    root: "",
    scannedAtMs: 0,
    scanDurationMs: 0,
    items,
    bySlug: new Map(items.map((item) => [item.slug, item])),
    topics,
    topicsBySlug: new Map(topics.map((topic) => [topic.slug, topic])),
    topicsByItem: new Map(),
    topicSpotsByItem: new Map(),
    glossary,
    glossaryBySlug: new Map(glossary.map((entry) => [entry.slug, entry])),
    collections,
    collectionsBySlug: new Map(collections.map((c) => [c.slug, c])),
    questions,
    questionsBySlug: new Map(questions.map((q) => [q.slug, q])),
    backlinks: new Map(),
    completeness: { geprueftAm: null, byTopic: new Map(), unverorteteFaeden: [] },
    tags: [],
    problems: [],
    cache: { readable: true, writable: true, note: null },
    watch: { mode: "aus", error: null },
  };
}

describe("buildGraph", () => {
  it("verbindet zwei Beiträge über einen Bezug", () => {
    const a = makeItem({ slug: "a", references: [{ from: "a", to: "b", target: { kind: "ganz" }, note: "", sourceLine: 1 }] });
    const b = makeItem({ slug: "b" });
    const graph = buildGraph(makeLibrary({ items: [a, b] }));
    expect(graph.edges).toContainEqual({ a: "item:a", b: "item:b" });
  });

  it("ignoriert einen Bezug ins Leere", () => {
    const a = makeItem({ slug: "a", references: [{ from: "a", to: "nirgends", target: { kind: "ganz" }, note: "", sourceLine: 1 }] });
    const graph = buildGraph(makeLibrary({ items: [a] }));
    expect(graph.edges).toEqual([]);
  });

  it("verbindet ein Thema mit seinen geordneten Beiträgen und Fundstellen", () => {
    const item1 = makeItem({ slug: "x" });
    const item2 = makeItem({ slug: "y" });
    const topic = makeTopic({
      slug: "thema",
      itemSlugs: ["x"],
      spots: [{ slug: "y", target: { kind: "ganz" }, note: "", sourceLine: 1 }],
    });
    const graph = buildGraph(makeLibrary({ items: [item1, item2], topics: [topic] }));
    expect(graph.edges).toContainEqual({ a: "topic:thema", b: "item:x" });
    expect(graph.edges).toContainEqual({ a: "topic:thema", b: "item:y" });
  });

  it("verbindet einen Begriff mit einer Fundstelle und mit einem anderen Begriff per Wikilink", () => {
    const item = makeItem({ slug: "x" });
    const other = makeGlossaryEntry({ slug: "andere" });
    const entry = makeGlossaryEntry({
      slug: "begriff",
      description: "Siehe auch [[andere]] und [[x]].",
      spots: [{ slug: "x", target: { kind: "ganz" }, note: "", sourceLine: 1 }],
    });
    const graph = buildGraph(makeLibrary({ items: [item], glossary: [entry, other] }));
    expect(graph.edges).toContainEqual({ a: "glossar:begriff", b: "item:x" });
    expect(graph.edges).toContainEqual({ a: "glossar:begriff", b: "glossar:andere" });
  });

  it("macht aus einem geteilten Tag einen eigenen Knoten mit zwei Kanten", () => {
    const item = makeItem({ slug: "x", tags: ["akku"] });
    const topic = makeTopic({ slug: "thema", tags: ["akku"] });
    const graph = buildGraph(makeLibrary({ items: [item], topics: [topic] }));
    expect(graph.nodes.filter((n) => n.kind === "tag")).toHaveLength(1);
    expect(graph.edges).toContainEqual({ a: "item:x", b: "tag:akku" });
    expect(graph.edges).toContainEqual({ a: "topic:thema", b: "tag:akku" });
  });

  it("verbindet eine Sammlung und eine Frage mit ihren Beiträgen", () => {
    const item = makeItem({ slug: "x" });
    const collection = makeCollection({ slug: "sammlung", entries: [{ slug: "x", target: { kind: "ganz" }, note: "", sourceLine: 1 }] });
    const question = makeQuestion({ slug: "frage", spots: [{ slug: "x", target: { kind: "ganz" }, note: "", sourceLine: 1 }] });
    const graph = buildGraph(makeLibrary({ items: [item], collections: [collection], questions: [question] }));
    expect(graph.edges).toContainEqual({ a: "sammlung:sammlung", b: "item:x" });
    expect(graph.edges).toContainEqual({ a: "frage:frage", b: "item:x" });
  });

  it("zählt eine beidseitig genannte Verbindung nur einmal", () => {
    const a = makeItem({ slug: "a", references: [{ from: "a", to: "b", target: { kind: "ganz" }, note: "", sourceLine: 1 }] });
    const b = makeItem({ slug: "b", references: [{ from: "b", to: "a", target: { kind: "ganz" }, note: "", sourceLine: 2 }] });
    const graph = buildGraph(makeLibrary({ items: [a, b] }));
    expect(graph.edges).toHaveLength(1);
  });
});

describe("neighborhoodOf", () => {
  it("findet die direkten Nachbarn eines Knotens", () => {
    const a = makeItem({ slug: "a" });
    const topic = makeTopic({ slug: "thema", itemSlugs: ["a"] });
    const graph = buildGraph(makeLibrary({ items: [a], topics: [topic] }));
    const { node, neighbors } = neighborhoodOf(graph, "item:a");
    expect(node?.label).toBe("Beitrag 1");
    expect(neighbors.map((n) => n.id)).toEqual(["topic:thema"]);
  });

  it("liefert null für eine unbekannte Kennung", () => {
    const graph = buildGraph(makeLibrary({}));
    expect(neighborhoodOf(graph, "item:nirgends").node).toBeNull();
  });
});
