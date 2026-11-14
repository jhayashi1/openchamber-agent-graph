import { describe, expect, test } from "bun:test";
import { centringStrength, createSimulation, type Point } from "./force";
import type { AgentGraph, AgentGraphNode } from "./graph";

function node(id: string, depth: number): AgentGraphNode {
  return {
    id,
    label: id,
    title: id,
    agent: "build",
    activity: "idle",
    outcome: null,
    depth,
    isCurrent: false,
    isRoot: depth === 0,
    createdAt: 0,
  };
}

const graph: AgentGraph = {
  rootId: "root",
  nodes: [node("root", 0), node("a", 1), node("b", 1), node("c", 1), node("a1", 2)],
  edges: [
    { from: "root", to: "a", kind: "dispatch" },
    { from: "root", to: "b", kind: "dispatch" },
    { from: "root", to: "c", kind: "dispatch" },
    { from: "a", to: "a1", kind: "dispatch" },
  ],
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function seeded() {
  let state = 42;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function settled(g: AgentGraph = graph) {
  const sim = createSimulation({ onTick: () => {}, animate: false, random: seeded() });
  sim.setGraph(g);
  return sim;
}

describe("createSimulation", () => {
  test("is deterministic with a seeded random source", () => {
    const a = [...settled().positions.values()].map(({ x, y }) => [x, y]);
    const b = [...settled().positions.values()].map(({ x, y }) => [x, y]);
    expect(a).toEqual(b);
  });

  test("gives every node a finite position and keeps nodes apart", () => {
    const points = [...settled().positions.values()];
    expect(points.length).toBe(graph.nodes.length);
    for (let i = 0; i < points.length; i++) {
      expect(Number.isFinite(points[i].x)).toBe(true);
      for (let j = i + 1; j < points.length; j++) expect(distance(points[i], points[j])).toBeGreaterThan(20);
    }
  });

  test("setGraph keeps positions of existing keys and places a new child near its parent", () => {
    const sim = createSimulation({ onTick: () => {}, random: seeded(), schedule: () => 1, cancel: () => {} });
    sim.setGraph(graph);
    sim.settle();
    const before = new Map([...sim.positions].map(([id, p]) => [id, { x: p.x, y: p.y }]));
    sim.setGraph({
      ...graph,
      nodes: [...graph.nodes, node("b1", 2)],
      edges: [...graph.edges, { from: "b", to: "b1", kind: "dispatch" }],
    });
    for (const [id, point] of before) expect(distance(point, sim.positions.get(id)!)).toBe(0);
    expect(distance(sim.positions.get("b1")!, sim.positions.get("b")!)).toBeLessThan(3 * 120);
  });

  test("a message-only partner starts near its partner", () => {
    const sim = createSimulation({ onTick: () => {}, random: seeded(), schedule: () => 1, cancel: () => {} });
    sim.setGraph(graph);
    sim.settle();
    const b = { ...sim.positions.get("b")! };
    sim.setGraph({
      ...graph,
      nodes: [...graph.nodes, node("out", 2)],
      edges: [...graph.edges, { from: "out", to: "b", kind: "message", count: 1, lastAt: 0 }],
    });
    expect(distance(sim.positions.get("out")!, b)).toBeLessThan(120 * 1.2);
  });

  test("an unchanged graph does not move, reheat or schedule", () => {
    const frames: Array<() => void> = [];
    const sim = createSimulation({ onTick: () => {}, random: seeded(), schedule: (callback) => frames.push(callback), cancel: () => {} });
    sim.setGraph(graph);
    sim.settle();
    const before = JSON.stringify([...sim.positions]);
    frames.length = 0;
    expect(sim.setGraph({ ...graph, nodes: graph.nodes.map((n) => ({ ...n, activity: "running" as const })) })).toBe(false);
    expect(frames).toHaveLength(0);
    expect(sim.running).toBe(false);
    expect(JSON.stringify([...sim.positions])).toBe(before);
  });

  test("adding a node keeps a dragged node fixed and barely moves the rest", () => {
    const sim = createSimulation({ onTick: () => {}, random: seeded(), schedule: () => 1, cancel: () => {} });
    sim.setGraph(graph);
    sim.settle();
    sim.pin("a", 600, 0);
    sim.reheat(0);
    sim.settle();
    const before = new Map([...sim.positions].map(([id, p]) => [id, { x: p.x, y: p.y }]));
    const grown = { ...graph, nodes: [...graph.nodes, node("d", 1)], edges: [...graph.edges, { from: "root", to: "d", kind: "dispatch" as const }] };
    expect(sim.setGraph(grown)).toBe(true);
    sim.settle();
    expect(sim.positions.get("a")).toMatchObject({ x: 600, y: 0 });
    for (const id of ["root", "b", "c", "a1"]) expect(distance(sim.positions.get(id)!, before.get(id)!)).toBeLessThan(1);
  });

  test("setForces changes parameters and reheats", () => {
    const sim = settled();
    expect(sim.alpha).toBeLessThan(0.001);
    sim.setForces({ repel: 800, distance: 200 });
    expect(sim.forces()).toMatchObject({ repel: 800, distance: 200 });
    expect(sim.alpha).toBeGreaterThan(0);
  });

  test("a higher link distance spreads the graph", () => {
    const spread = (d: number) => {
      const sim = settled();
      sim.setForces({ distance: d });
      return distance(sim.positions.get("root")!, sim.positions.get("a")!);
    };
    expect(spread(300)).toBeGreaterThan(spread(60));
  });

  test("pin fixes a node and unpin releases it", () => {
    const sim = createSimulation({ onTick: () => {}, animate: false, random: seeded() });
    sim.setGraph(graph);
    sim.pin("a", 500, 500);
    for (let i = 0; i < 20; i++) sim.step();
    expect(sim.positions.get("a")).toMatchObject({ x: 500, y: 500 });
    sim.unpin("a");
    sim.reheat(0);
    for (let i = 0; i < 100; i++) sim.step();
    expect(distance(sim.positions.get("a")!, { x: 500, y: 500 })).toBeGreaterThan(1);
  });

  test("a neighbour follows a dragged node, and the loop stops after release", () => {
    const frames: Array<() => void> = [];
    const sim = createSimulation({ onTick: () => {}, random: seeded(), schedule: (callback) => frames.push(callback), cancel: () => {} });
    sim.setGraph(graph);
    sim.settle();
    const before = distance(sim.positions.get("a1")!, { x: 600, y: 0 });
    sim.reheat(0.3);
    sim.pin("a", 600, 0);
    for (let i = 0; i < 60; i++) sim.step();
    expect(sim.positions.get("a")).toMatchObject({ x: 600, y: 0 });
    expect(distance(sim.positions.get("a1")!, { x: 600, y: 0 })).toBeLessThan(before);
    expect(sim.alpha).toBeGreaterThan(0.25);
    sim.unpin("a");
    sim.reheat(0);
    for (let i = 0; i < 2000 && frames.length > 0; i++) frames.shift()!();
    expect(frames).toHaveLength(0);
    expect(sim.running).toBe(false);
  });

  test("the frame loop runs while hot and sleeps when alpha drops below alphaMin", () => {
    const frames: Array<() => void> = [];
    let ticks = 0;
    const sim = createSimulation({
      onTick: () => ticks++,
      random: seeded(),
      schedule: (callback) => frames.push(callback),
      cancel: () => {},
    });
    sim.setGraph(graph);
    expect(sim.running).toBe(true);
    let guard = 0;
    while (frames.length > 0 && guard++ < 5000) frames.shift()!();
    expect(sim.alpha).toBeLessThan(0.001);
    expect(sim.running).toBe(false);
    expect(ticks).toBeGreaterThan(10);
    expect(frames.length).toBe(0);
  });

  test("settles 300 nodes quickly", () => {
    const nodes = [node("root", 0)];
    const edges: AgentGraph["edges"] = [];
    for (let i = 1; i < 300; i++) {
      nodes.push(node(`n${i}`, 1 + Math.floor(Math.log2(i))));
      edges.push({ from: i === 1 ? "root" : `n${Math.floor(i / 2) || 1}`, to: `n${i}`, kind: "dispatch" });
    }
    const sim = createSimulation({ onTick: () => {}, random: seeded(), schedule: () => 1, cancel: () => {} });
    sim.setGraph({ rootId: "root", nodes, edges });
    const start = performance.now();
    sim.settle();
    const elapsed = performance.now() - start;
    console.log(`settle 300 nodes: ${elapsed.toFixed(1)} ms`);
    expect(elapsed).toBeLessThan(2000);
    sim.dispose();
  });

  describe("hub pull", () => {
    const mixed: AgentGraph = {
      ...graph,
      edges: [...graph.edges, { from: "b", to: "root", kind: "message", count: 1, lastAt: 0 }],
    };
    const settle = (hubPull: number, g = graph) => {
      const sim = createSimulation({ onTick: () => {}, animate: false, random: seeded(), forces: { hubPull } });
      sim.setGraph(g);
      sim.settle();
      return sim;
    };

    test("degree counts dispatch and message edges in both directions", () => {
      const sim = settle(1, mixed);
      const c = sim.forces().center;
      expect(sim.centringOf("root")).toBeCloseTo(c * (1 + 3), 10);
      expect(sim.centringOf("b")).toBeCloseTo(c * (1 + 1), 10);
      expect(sim.centringOf("a")).toBeCloseTo(c * (1 + 1), 10);
      expect(sim.centringOf("c")).toBeCloseTo(c, 10);
    });

    test("hubs pull harder than leaves and strength is capped at 1", () => {
      expect(centringStrength(0.05, 1, 4)).toBeGreaterThan(centringStrength(0.05, 1, 1));
      expect(centringStrength(0.05, 1, 1)).toBe(0.05);
      expect(centringStrength(0.5, 3, 20)).toBe(1);
    });

    test("hubPull 0 gives uniform strength", () => {
      const sim = settle(0);
      for (const id of ["root", "a", "c", "a1"]) expect(sim.centringOf(id)).toBe(sim.forces().center);
    });

    test("after settling the hub sits nearer the origin than the leaves, and nearer than without hub pull", () => {
      const radius = (sim: ReturnType<typeof settle>, id: string) => Math.hypot(sim.positions.get(id)!.x, sim.positions.get(id)!.y);
      const on = settle(1);
      const off = settle(0);
      const leaves = ["b", "c", "a1"];
      const meanLeaf = leaves.reduce((sum, id) => sum + radius(on, id), 0) / leaves.length;
      expect(radius(on, "root")).toBeLessThan(meanLeaf);
      expect(radius(on, "a")).toBeLessThan(meanLeaf);
      const hubs = ["root", "a"];
      const total = (sim: ReturnType<typeof settle>) => hubs.reduce((sum, id) => sum + radius(sim, id), 0);
      expect(total(on)).toBeLessThan(total(off));
    });

    test("setForces hubPull updates strengths and reheats", () => {
      const sim = settle(0);
      sim.setForces({ hubPull: 2 });
      expect(sim.centringOf("root")).toBeCloseTo(sim.forces().center * 5, 10);
      expect(sim.alpha).toBeGreaterThan(0);
    });

    test("an unchanged graph returns false and schedules nothing", () => {
      const scheduled: number[] = [];
      const sim = createSimulation({ onTick: () => {}, animate: true, random: seeded(), schedule: () => scheduled.push(1), cancel: () => {} });
      sim.setGraph(graph);
      sim.settle();
      scheduled.length = 0;
      expect(sim.setGraph({ ...graph, nodes: [...graph.nodes] })).toBe(false);
      expect(scheduled.length).toBe(0);
    });
  });
});
