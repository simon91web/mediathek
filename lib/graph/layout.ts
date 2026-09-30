/*
 * Kräftebasiertes Layout für den Graphen (Fruchterman-Reingold, vereinfacht):
 * alle Knoten stoßen sich ab, verbundene ziehen sich zusätzlich an. Läuft
 * EINMAL durch und liefert feste Positionen — keine laufende Simulation, die
 * Karte ist zum Anschauen und Anklicken gedacht, nicht zum Herumziehen.
 *
 * Rein und ohne DOM, damit sich das Ergebnis testen lässt: derselbe Graph
 * ergibt immer dieselben Positionen (fester Start auf einem Kreis, keine
 * Zufallszahl).
 */

export type LayoutNode = { id: string };
export type LayoutEdge = { a: string; b: string };
export type Point = { x: number; y: number };

export type LayoutOptions = {
  width?: number;
  height?: number;
  iterations?: number;
};

export function computeLayout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: LayoutOptions = {},
): Map<string, Point> {
  const width = options.width ?? 1000;
  const height = options.height ?? 700;
  const iterations = options.iterations ?? 300;

  const positions = new Map<string, Point>();
  const n = nodes.length;
  if (n === 0) return positions;

  // Start auf einem Kreis: deterministisch, und kein Knoten beginnt auf
  // einem anderen (sonst hätten die Kräfte am Anfang nichts zu greifen).
  const cx = width / 2;
  const cy = height / 2;
  const startRadius = Math.min(width, height) * 0.35;
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    positions.set(node.id, {
      x: cx + startRadius * Math.cos(angle),
      y: cy + startRadius * Math.sin(angle),
    });
  });
  if (n === 1) return positions;

  const k = Math.sqrt((width * height) / n);
  let temperature = Math.min(width, height) / 10;
  const cooling = temperature / iterations;
  const ids = nodes.map((node) => node.id);

  for (let iter = 0; iter < iterations; iter += 1) {
    const disp = new Map<string, Point>(ids.map((id) => [id, { x: 0, y: 0 }]));

    // Abstoßung zwischen jedem Paar — der teure Teil, O(n²) je Durchgang.
    for (let i = 0; i < ids.length; i += 1) {
      const p1 = positions.get(ids[i])!;
      const d1 = disp.get(ids[i])!;
      for (let j = i + 1; j < ids.length; j += 1) {
        const p2 = positions.get(ids[j])!;
        const rawDx = p1.x - p2.x;
        const rawDy = p1.y - p2.y;
        const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy) || 0.01;
        const force = (k * k) / dist;
        const dx = (rawDx / dist) * force;
        const dy = (rawDy / dist) * force;
        d1.x += dx;
        d1.y += dy;
        const d2 = disp.get(ids[j])!;
        d2.x -= dx;
        d2.y -= dy;
      }
    }

    // Anziehung nur entlang echter Kanten.
    for (const edge of edges) {
      const p1 = positions.get(edge.a);
      const p2 = positions.get(edge.b);
      const d1 = disp.get(edge.a);
      const d2 = disp.get(edge.b);
      if (!p1 || !p2 || !d1 || !d2) continue;
      const rawDx = p1.x - p2.x;
      const rawDy = p1.y - p2.y;
      const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy) || 0.01;
      const force = (dist * dist) / k;
      const dx = (rawDx / dist) * force;
      const dy = (rawDy / dist) * force;
      d1.x -= dx;
      d1.y -= dy;
      d2.x += dx;
      d2.y += dy;
    }

    // Verschieben, durch die Temperatur gedeckelt, dann in den Rahmen klemmen.
    for (const id of ids) {
      const p = positions.get(id)!;
      const d = disp.get(id)!;
      const dist = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      const limited = Math.min(dist, temperature);
      p.x = Math.min(width, Math.max(0, p.x + (d.x / dist) * limited));
      p.y = Math.min(height, Math.max(0, p.y + (d.y / dist) * limited));
    }

    temperature = Math.max(0, temperature - cooling);
  }

  return positions;
}

/** Wie viele Kanten an jedem Knoten hängen — für die Knotengröße. */
export function degreeMap(edges: readonly LayoutEdge[]): Map<string, number> {
  const degrees = new Map<string, number>();
  const bump = (id: string) => degrees.set(id, (degrees.get(id) ?? 0) + 1);
  for (const edge of edges) {
    bump(edge.a);
    bump(edge.b);
  }
  return degrees;
}
