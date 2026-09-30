import type { Metadata } from "next";

import { GraphView } from "@/components/graph/graph-view";
import { getLibrary } from "@/lib/library";
import { buildGraph } from "@/lib/library/graph";

export const metadata: Metadata = { title: "Graph" };

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ fokus?: string }>;
}) {
  const { fokus } = await searchParams;
  const library = await getLibrary();
  const graph = buildGraph(library);

  return <GraphView nodes={graph.nodes} edges={graph.edges} focusId={fokus ?? null} />;
}
