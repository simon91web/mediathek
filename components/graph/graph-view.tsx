"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { computeLayout, degreeMap } from "@/lib/graph/layout";
import type { GraphEdge, GraphNode } from "@/lib/library/graph";
import { NODE_COLOR, NODE_LABEL, NODE_LABEL_PLURAL } from "./kind";

/*
 * Der volle Graph — Kräfte-Layout einmal berechnet (lib/graph/layout.ts),
 * dann nur noch angesehen: anklicken öffnet das Panel, ziehen schwenkt,
 * Mausrad zoomt. Kein Herumziehen einzelner Knoten — das wäre eine zweite
 * Interaktion, die diese Ansicht nicht braucht.
 */

const CANVAS_W = 1400;
const CANVAS_H = 900;

export function GraphView({
  nodes,
  edges,
  focusId,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focusId?: string | null;
}) {
  const positions = useMemo(
    () => computeLayout(nodes, edges, { width: CANVAS_W, height: CANVAS_H, iterations: 260 }),
    [nodes, edges],
  );
  const degrees = useMemo(() => degreeMap(edges), [edges]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const initialView = useMemo(() => {
    const size = { w: CANVAS_W, h: 720 };
    if (focusId) {
      const pos = positions.get(focusId);
      if (pos) {
        return { x: pos.x - size.w / 2, y: pos.y - size.h / 2, ...size };
      }
    }
    return { x: 0, y: 0, ...size };
  }, [focusId, positions]);

  const [view, setView] = useState(initialView);
  const [selectedId, setSelectedId] = useState<string | null>(focusId ?? null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pan = useRef<{ startX: number; startY: number; view: typeof view } | null>(null);

  const toSvgPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: view.x + ((clientX - rect.left) / rect.width) * view.w,
      y: view.y + ((clientY - rect.top) / rect.height) * view.h,
    };
  };

  const onWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
    const point = toSvgPoint(event.clientX, event.clientY);
    setView((current) => {
      const w = Math.min(CANVAS_W * 1.6, Math.max(200, current.w * factor));
      const h = Math.min(CANVAS_H * 1.6, Math.max(140, current.h * factor));
      return {
        w,
        h,
        x: point.x - ((point.x - current.x) / current.w) * w,
        y: point.y - ((point.y - current.y) / current.h) * h,
      };
    });
  };

  const onBackgroundDown = (event: React.MouseEvent<SVGSVGElement>) => {
    pan.current = { startX: event.clientX, startY: event.clientY, view };
  };
  const onBackgroundMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!pan.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((event.clientX - pan.current.startX) / rect.width) * pan.current.view.w;
    const dy = ((event.clientY - pan.current.startY) / rect.height) * pan.current.view.h;
    setView({ ...pan.current.view, x: pan.current.view.x - dx, y: pan.current.view.y - dy });
  };
  const endPan = () => {
    pan.current = null;
  };

  const selected = selectedId ? byId.get(selectedId) : null;
  const neighborIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const set = new Set<string>();
    for (const edge of edges) {
      if (edge.a === selectedId) set.add(edge.b);
      else if (edge.b === selectedId) set.add(edge.a);
    }
    return set;
  }, [edges, selectedId]);

  const legendKinds = useMemo(() => {
    const seen = new Set(nodes.map((n) => n.kind));
    return (Object.keys(NODE_LABEL_PLURAL) as Array<keyof typeof NODE_LABEL_PLURAL>).filter((k) =>
      seen.has(k),
    );
  }, [nodes]);

  return (
    <div className="relative -mx-4 flex h-[80vh] min-h-[520px] flex-col overflow-hidden border-y border-rand sm:mx-0 sm:rounded-xl sm:border-x">
      <div className="flex flex-wrap items-center gap-4 border-b border-rand px-5 py-3">
        <h1 className="text-sm font-semibold">Graph</h1>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          {legendKinds.map((kind) => (
            <span key={kind} className="flex items-center gap-1.5 text-xs text-schrift-2">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ background: NODE_COLOR[kind] }}
              />
              {NODE_LABEL_PLURAL[kind]}
            </span>
          ))}
        </div>
      </div>

      <div className="relative flex-1">
        <svg
          ref={svgRef}
          className="size-full touch-none"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          onWheel={onWheel}
          onMouseDown={onBackgroundDown}
          onMouseMove={onBackgroundMove}
          onMouseUp={endPan}
          onMouseLeave={endPan}
        >
          {edges.map((edge, index) => {
            const p1 = positions.get(edge.a);
            const p2 = positions.get(edge.b);
            if (!p1 || !p2) return null;
            const dimmed =
              selectedId !== null && edge.a !== selectedId && edge.b !== selectedId;
            return (
              <line
                key={index}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="var(--color-rand)"
                strokeWidth={1.2}
                opacity={dimmed ? 0.25 : 0.8}
              />
            );
          })}
          {nodes.map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const r = 7 + Math.min(16, (degrees.get(node.id) ?? 0) * 1.6);
            const isSelected = node.id === selectedId;
            const dimmed = selectedId !== null && !isSelected && !neighborIds.has(node.id);
            return (
              <g
                key={node.id}
                style={{ cursor: "pointer" }}
                opacity={dimmed ? 0.35 : 1}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedId(node.id);
                }}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={r}
                  fill={NODE_COLOR[node.kind]}
                  stroke={isSelected ? "var(--color-schrift)" : "none"}
                  strokeWidth={isSelected ? 2 : 0}
                />
                <text
                  x={pos.x}
                  y={pos.y + r + 12}
                  textAnchor="middle"
                  fontSize={11}
                  fill={isSelected ? "var(--color-schrift)" : "var(--color-schrift-2)"}
                  fontWeight={isSelected ? 600 : 400}
                  style={{ pointerEvents: "none" }}
                >
                  {node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {selected ? (
          <aside className="absolute inset-y-0 right-0 w-[360px] overflow-y-auto border-l border-rand bg-grund p-5 shadow-[-12px_0_24px_-18px_rgba(0,0,0,.25)]">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Schließen"
              className="absolute top-3.5 right-3.5 flex size-7 items-center justify-center rounded-md text-schrift-3 hover:bg-grund-3 hover:text-schrift"
            >
              <X aria-hidden className="size-4" />
            </button>
            <p
              className="flex items-center gap-1.5 text-xs tracking-wide uppercase"
              style={{ color: NODE_COLOR[selected.kind] }}
            >
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ background: NODE_COLOR[selected.kind] }}
              />
              {NODE_LABEL[selected.kind]}
            </p>
            <h2 className="mt-1.5 pr-6 text-lg leading-snug font-semibold">{selected.label}</h2>
            {selected.meta ? (
              <p className="mt-1 text-xs text-schrift-3">{selected.meta}</p>
            ) : null}
            {selected.excerpt ? (
              <p className="mt-3 text-sm leading-relaxed text-schrift-2">{selected.excerpt}</p>
            ) : null}

            {neighborIds.size > 0 ? (
              <>
                <p className="mt-5 mb-1.5 text-[11px] tracking-wide text-schrift-3 uppercase">
                  Verbindungen
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...neighborIds].map((id) => {
                    const neighbor = byId.get(id);
                    if (!neighbor) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedId(id)}
                        className="rounded-md bg-grund-3 px-2 py-0.5 text-xs text-schrift-2 hover:bg-akzent/10 hover:text-akzent"
                      >
                        {neighbor.label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            <Link
              href={selected.href}
              className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-akzent px-3.5 text-sm font-medium text-white hover:bg-akzent-dunkel"
            >
              Öffnen
            </Link>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
