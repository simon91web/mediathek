import { describe, expect, it } from "vitest";

import { computeLayout, degreeMap } from "./layout";

describe("computeLayout", () => {
  it("liefert eine Position je Knoten", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const positions = computeLayout(nodes, [], { iterations: 20 });
    expect([...positions.keys()].sort()).toEqual(["a", "b", "c"]);
  });

  it("hält alle Positionen innerhalb des Rahmens", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}` }));
    const edges = nodes.slice(1).map((n, i) => ({ a: nodes[i].id, b: n.id }));
    const positions = computeLayout(nodes, edges, {
      width: 400,
      height: 300,
      iterations: 100,
    });
    for (const { x, y } of positions.values()) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(400);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(300);
    }
  });

  it("rückt verbundene Knoten näher zusammen als unverbundene", () => {
    // a-b sind verbunden, c steht für sich allein.
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const edges = [{ a: "a", b: "b" }];
    const positions = computeLayout(nodes, edges, {
      width: 800,
      height: 600,
      iterations: 200,
    });
    const dist = (p: string, q: string) => {
      const a = positions.get(p)!;
      const b = positions.get(q)!;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    expect(dist("a", "b")).toBeLessThan(dist("a", "c"));
  });

  it("ist deterministisch — derselbe Graph ergibt dieselben Positionen", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const edges = [{ a: "a", b: "b" }, { a: "b", b: "c" }];
    const first = computeLayout(nodes, edges, { iterations: 50 });
    const second = computeLayout(nodes, edges, { iterations: 50 });
    for (const id of ["a", "b", "c", "d"]) {
      expect(first.get(id)).toEqual(second.get(id));
    }
  });

  it("kommt mit einem einzelnen Knoten zurecht", () => {
    const positions = computeLayout([{ id: "einsam" }], []);
    expect(positions.size).toBe(1);
  });

  it("liefert eine leere Karte ohne Knoten", () => {
    expect(computeLayout([], []).size).toBe(0);
  });
});

describe("degreeMap", () => {
  it("zählt Kanten je Knoten, auch wenn er mal a und mal b ist", () => {
    const degrees = degreeMap([
      { a: "x", b: "y" },
      { a: "z", b: "x" },
    ]);
    expect(degrees.get("x")).toBe(2);
    expect(degrees.get("y")).toBe(1);
    expect(degrees.get("z")).toBe(1);
  });
});
