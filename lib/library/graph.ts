import { findWikilinks } from "./wikilink";
import { formatDurationShort } from "@/lib/utils";
import type { LibraryState } from "./types";

/*
 * Der Graph über die ganze Bibliothek — sechs Knotenarten, eine Kante-Liste.
 *
 * Bewusst getrennt von lib/graph/layout.ts: hier steht NUR, was mit was
 * zusammenhängt (reine Bibliotheksdaten, ohne node.x/y). Wo die Knoten
 * landen, ist eine Layout-Frage, keine Datenfrage — computeLayout() rechnet
 * das aus dieser Struktur, unabhängig von ihr.
 *
 * Kennungen tragen ihre Art als Präfix ("item:<slug>", "tag:<wort>", …),
 * weil ein Tag und ein Beitrag zufällig denselben Namen haben könnten und
 * die Bibliothek sonst vier getrennte Namensräume auf einen zusammenwürfeln
 * würde.
 */

export type GraphNodeKind =
  | "item"
  | "topic"
  | "glossar"
  | "sammlung"
  | "frage"
  | "tag";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  href: string;
  /** Eine Zeile, direkt anzeigbar — "Video · 3:00", "3 Teile", … */
  meta: string;
  /** Kurzer Auszug für das Panel. Darf leer sein (z. B. bei einem Tag). */
  excerpt: string;
};

export type GraphEdge = { a: string; b: string };

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

const KIND_LABEL = { video: "Video", audio: "Sprachmemo", text: "Text" } as const;

const itemId = (slug: string) => `item:${slug}`;
const topicId = (slug: string) => `topic:${slug}`;
const glossarId = (slug: string) => `glossar:${slug}`;
const sammlungId = (slug: string) => `sammlung:${slug}`;
const frageId = (slug: string) => `frage:${slug}`;
const tagId = (tag: string) => `tag:${tag}`;

function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 159)}…` : flat;
}

export function buildGraph(library: LibraryState): Graph {
  const nodes = new Map<string, GraphNode>();
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];

  const addNode = (node: GraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (a: string, b: string) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ a, b });
  };
  const addTag = (tag: string, from: string) => {
    const id = tagId(tag);
    addNode({ id, kind: "tag", label: tag, href: `/medien?schlagwort=${encodeURIComponent(tag)}`, meta: "", excerpt: "" });
    addEdge(from, id);
  };

  for (const item of library.items) {
    const id = itemId(item.slug);
    addNode({
      id,
      kind: "item",
      label: item.title,
      href: `/medien/${item.slug}`,
      meta:
        KIND_LABEL[item.kind] +
        (item.durationSeconds ? ` · ${formatDurationShort(item.durationSeconds)}` : ""),
      excerpt: excerptOf(item.description),
    });
    for (const tag of item.tags) addTag(tag, id);
    for (const reference of item.references) {
      if (!library.bySlug.has(reference.to)) continue;
      addEdge(id, itemId(reference.to));
    }
  }

  for (const topic of library.topics) {
    const id = topicId(topic.slug);
    addNode({
      id,
      kind: "topic",
      label: topic.title,
      href: `/themen/${topic.slug}`,
      meta: topic.itemSlugs.length > 0 ? `${topic.itemSlugs.length} Teile` : "",
      excerpt: excerptOf(topic.description),
    });
    for (const slug of topic.itemSlugs) {
      if (library.bySlug.has(slug)) addEdge(id, itemId(slug));
    }
    for (const spot of topic.spots) {
      if (library.bySlug.has(spot.slug)) addEdge(id, itemId(spot.slug));
    }
    for (const tag of topic.tags) addTag(tag, id);
  }

  for (const entry of library.glossary) {
    const id = glossarId(entry.slug);
    addNode({
      id,
      kind: "glossar",
      label: entry.begriff,
      href: `/glossar/${entry.slug}`,
      meta: entry.spots.length > 0 ? `${entry.spots.length} Fundstellen` : "",
      excerpt: excerptOf(entry.description),
    });
    for (const spot of entry.spots) {
      if (library.bySlug.has(spot.slug)) addEdge(id, itemId(spot.slug));
    }
    // Querverweise zu anderen Begriffen — dieselbe Klammer wie DefinitionText
    // löst, nur hier als Kante statt als Link.
    for (const link of findWikilinks(entry.description)) {
      if (library.glossaryBySlug.has(link.slug)) {
        addEdge(id, glossarId(link.slug));
      } else if (library.bySlug.has(link.slug)) {
        addEdge(id, itemId(link.slug));
      }
    }
  }

  for (const collection of library.collections) {
    const id = sammlungId(collection.slug);
    addNode({
      id,
      kind: "sammlung",
      label: collection.title,
      href: `/sammlungen/${collection.slug}`,
      meta: collection.query
        ? "Gespeicherte Suche"
        : `${collection.entries.length} Ausschnitte`,
      excerpt: excerptOf(collection.description),
    });
    for (const entry of collection.entries) {
      if (library.bySlug.has(entry.slug)) addEdge(id, itemId(entry.slug));
    }
  }

  for (const question of library.questions) {
    const id = frageId(question.slug);
    addNode({
      id,
      kind: "frage",
      label: question.question,
      href: `/fragen/${question.slug}`,
      meta: "Frage",
      excerpt: excerptOf(question.answer),
    });
    for (const spot of question.spots) {
      if (library.bySlug.has(spot.slug)) addEdge(id, itemId(spot.slug));
    }
  }

  return { nodes: [...nodes.values()], edges };
}

/** Ein Knoten und alles, was direkt daran hängt — das Schreibfenster des lokalen Graphen. */
export function neighborhoodOf(
  graph: Graph,
  nodeId: string,
): { node: GraphNode | null; neighbors: GraphNode[] } {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const node = byId.get(nodeId) ?? null;
  if (!node) return { node: null, neighbors: [] };

  const neighborIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.a === nodeId) neighborIds.add(edge.b);
    else if (edge.b === nodeId) neighborIds.add(edge.a);
  }
  const neighbors = [...neighborIds]
    .map((id) => byId.get(id))
    .filter((n): n is GraphNode => n !== undefined);

  return { node, neighbors };
}
