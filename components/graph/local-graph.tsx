import Link from "next/link";

import type { GraphNode } from "@/lib/library/graph";
import { NODE_COLOR } from "./kind";

/*
 * Der kleine Graph oben rechts auf jeder Detailseite: der aktuelle Beitrag /
 * das aktuelle Thema / der aktuelle Begriff / … in der Mitte, seine direkten
 * Nachbarn drumherum. Kein Kräfte-Layout nötig — bei einer Handvoll Nachbarn
 * reicht ein Kreis, gleichmäßig verteilt.
 *
 * Reiner Server-Bestandteil: nur Links und CSS-Hover, kein Zustand, also
 * kein "use client".
 */

const W = 220;
const H = 168;
const CX = W / 2;
const CY = 78;
const RADIUS = 46;
const MAX_SHOWN = 6;

function short(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export function LocalGraph({
  node,
  neighbors,
  graphHref,
}: {
  node: GraphNode;
  neighbors: GraphNode[];
  graphHref: string;
}) {
  if (neighbors.length === 0) return null;

  const shown = neighbors.slice(0, MAX_SHOWN);
  const positioned = shown.map((neighbor, index) => {
    const angle = (2 * Math.PI * index) / shown.length - Math.PI / 2;
    return {
      neighbor,
      x: CX + RADIUS * Math.cos(angle),
      y: CY + RADIUS * Math.sin(angle),
    };
  });

  return (
    <div className="w-[220px] shrink-0 rounded-xl border border-rand bg-grund-2">
      <div className="flex items-center justify-between border-b border-rand px-2.5 py-1.5">
        <span className="text-[11px] tracking-wide text-schrift-3 uppercase">Graph</span>
        <Link
          href={graphHref}
          aria-label="Ganzen Graph öffnen"
          title="Ganzen Graph öffnen"
          className="flex size-[22px] items-center justify-center rounded-md text-schrift-3 hover:bg-grund-3 hover:text-schrift"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="m21 3-7 7" />
            <path d="m3 21 7-7" />
          </svg>
        </Link>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {positioned.map(({ neighbor, x, y }) => (
          <line
            key={neighbor.id}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke="var(--color-rand)"
            strokeWidth={1}
          />
        ))}
        {positioned.map(({ neighbor, x, y }) => (
          <Link key={neighbor.id} href={neighbor.href}>
            <circle cx={x} cy={y} r={7} fill={NODE_COLOR[neighbor.kind]} />
            <text
              x={x}
              y={y + (y > CY ? 17 : -11)}
              textAnchor="middle"
              fontSize={9.5}
              fill="var(--color-schrift-2)"
            >
              {short(neighbor.label, 14)}
            </text>
          </Link>
        ))}
        <circle
          cx={CX}
          cy={CY}
          r={10}
          fill={NODE_COLOR[node.kind]}
          stroke="var(--color-schrift)"
          strokeWidth={1.5}
        />
        <text
          x={CX}
          y={CY + 24}
          textAnchor="middle"
          fontSize={10.5}
          fontWeight={600}
          fill="var(--color-schrift)"
        >
          {short(node.label, 16)}
        </text>
      </svg>
      {neighbors.length > shown.length ? (
        <p className="px-2.5 pb-2 text-[11px] text-schrift-3">
          +{neighbors.length - shown.length} weitere
        </p>
      ) : null}
    </div>
  );
}
