import type { GraphNodeKind } from "@/lib/library/graph";

/** Eine Farbe und ein Wort je Knotenart — Legende, Knotenfüllung, Panel-Eyebrow teilen sich das. */
export const NODE_COLOR: Record<GraphNodeKind, string> = {
  item: "var(--color-akzent)",
  topic: "var(--color-graph-topic)",
  glossar: "var(--color-graph-glossar)",
  sammlung: "var(--color-graph-sammlung)",
  frage: "var(--color-graph-frage)",
  tag: "var(--color-graph-tag)",
};

export const NODE_LABEL: Record<GraphNodeKind, string> = {
  item: "Beitrag",
  topic: "Thema",
  glossar: "Glossar",
  sammlung: "Sammlung",
  frage: "Frage",
  tag: "Tag",
};

export const NODE_LABEL_PLURAL: Record<GraphNodeKind, string> = {
  item: "Beiträge",
  topic: "Themen",
  glossar: "Glossar",
  sammlung: "Sammlungen",
  frage: "Fragen",
  tag: "Tags",
};
