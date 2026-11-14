import {
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { AgentGraph } from "./graph";

export type Point = { x: number; y: number };

export type ForceParameters = {
  /** Pull toward the origin (0 to 1). */
  center: number;
  /** Extra centring per edge beyond the first: strength = center * (1 + hubPull * (degree - 1)), capped at 1. */
  hubPull: number;
  /** Repulsion strength between nodes. */
  repel: number;
  /** Link stiffness for dispatch edges (0 to 1). */
  link: number;
  /** Rest length of dispatch edges in graph units. */
  distance: number;
};

export const DEFAULT_FORCES: ForceParameters = { center: 0.05, hubPull: 1, repel: 300, link: 0.3, distance: 120 };

export function centringStrength(center: number, hubPull: number, degree: number): number {
  return Math.min(1, center * (1 + hubPull * Math.max(0, degree - 1)));
}

type SimNode = SimulationNodeDatum & { id: string; x: number; y: number };
type SimLink = SimulationLinkDatum<SimNode> & { kind: "dispatch" | "message" };

const MESSAGE_STRENGTH_SCALE = 1 / 3;
const MESSAGE_DISTANCE_SCALE = 1.5;
const THETA = 0.9;
const ALPHA_MIN = 0.001;
export const GRAPH_CHANGE_ALPHA = 0.3;
/** Reheat when nodes or edges change on an existing layout: enough for new nodes to settle, little drift for old ones. */
export const GRAPH_GROW_ALPHA = 0.05;
const PRERUN_TICKS = 300;
const PLACEMENT_JITTER = 0.25;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export type SimulationOptions = {
  onTick: (positions: ReadonlyMap<string, Point>) => void;
  /** When false, every reheat settles synchronously and no frames are scheduled. */
  animate?: boolean;
  forces?: Partial<ForceParameters>;
  /** Seeded random source in [0, 1) for deterministic placement and jiggle. */
  random?: () => number;
  /** Frame scheduler; defaults to requestAnimationFrame. */
  schedule?: (callback: () => void) => number;
  cancel?: (handle: number) => void;
};

export type GraphSimulation = {
  /** Returns true when node ids or edges changed. An unchanged graph does not move or reheat anything. */
  setGraph(graph: AgentGraph): boolean;
  setForces(forces: Partial<ForceParameters>): void;
  /** Fix a node at a position (drag) and keep the simulation awake. */
  pin(id: string, x: number, y: number): void;
  /** Release a node so forces move it again. Dropped nodes stay fixed; the panel does not call this on release. */
  unpin(id: string): void;
  /** Hold alpha at alphaTarget (use 0.3 while dragging, 0 on release) and wake the loop. */
  reheat(alphaTarget?: number): void;
  /** Run ticks synchronously until the simulation has cooled, then report once. */
  settle(): void;
  /** Advance one tick and report; used by the frame loop and by tests. */
  step(): void;
  readonly positions: ReadonlyMap<string, Point>;
  readonly alpha: number;
  readonly running: boolean;
  forces(): ForceParameters;
  /** Current centring strength of a node (grows with its edge count). */
  centringOf(id: string): number;
  dispose(): void;
};

export function createSimulation(options: SimulationOptions): GraphSimulation {
  const animate = options.animate ?? true;
  const random = options.random ?? Math.random;
  const schedule = options.schedule ?? ((callback) => requestAnimationFrame(callback));
  const cancel = options.cancel ?? ((handle) => cancelAnimationFrame(handle));
  let parameters: ForceParameters = { ...DEFAULT_FORCES, ...options.forces };

  const nodes = new Map<string, SimNode>();
  const many = forceManyBody<SimNode>().theta(THETA);
  const links = forceLink<SimNode, SimLink>([]).id((node) => node.id);
  const pullX = forceX<SimNode>(0);
  const pullY = forceY<SimNode>(0);
  const simulation: Simulation<SimNode, SimLink> = forceSimulation<SimNode, SimLink>([])
    .randomSource(random)
    .alphaMin(ALPHA_MIN)
    .force("charge", many)
    .force("link", links)
    .force("x", pullX)
    .force("y", pullY)
    .stop();

  const degrees = new Map<string, number>();
  const centring = (node: SimNode) => centringStrength(parameters.center, parameters.hubPull, degrees.get(node.id) ?? 0);

  let frame: number | null = null;
  let signature = "";
  /** Existing nodes held still while new nodes settle in; released when cooled or when a drag starts. */
  const held = new Set<string>();

  function releaseHeld() {
    for (const id of held) {
      const node = nodes.get(id);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
    }
    held.clear();
  }

  function applyForces() {
    many.strength(-parameters.repel);
    pullX.strength(centring);
    pullY.strength(centring);
    links
      .distance((link) => (link.kind === "message" ? parameters.distance * MESSAGE_DISTANCE_SCALE : parameters.distance))
      .strength((link) => (link.kind === "message" ? parameters.link * MESSAGE_STRENGTH_SCALE : parameters.link));
  }
  applyForces();

  function report() {
    options.onTick(nodes);
  }

  function loop() {
    frame = null;
    simulation.tick();
    report();
    if (simulation.alpha() >= ALPHA_MIN) frame = schedule(loop);
    else releaseHeld();
  }

  function wake() {
    if (!animate) {
      if (simulation.alphaTarget() > 0) {
        simulation.tick();
        report();
      } else settle();
      return;
    }
    frame ??= schedule(loop);
  }

  function settle() {
    if (frame !== null) cancel(frame);
    frame = null;
    for (let i = 0; i < PRERUN_TICKS * 3 && simulation.alpha() >= ALPHA_MIN; i++) simulation.tick();
    releaseHeld();
    report();
  }

  function reheatTo(alpha: number) {
    simulation.alpha(Math.max(simulation.alpha(), alpha));
    wake();
  }

  return {
    setGraph(graph) {
      const next = JSON.stringify([
        graph.nodes.map((node) => node.id).sort(),
        graph.edges.map((edge) => `${edge.kind}:${edge.from}->${edge.to}`).sort(),
      ]);
      if (next === signature) return false;
      const hadNodes = nodes.size > 0;
      signature = next;
      releaseHeld();
      const ordered = [...graph.nodes].sort((a, b) => a.depth - b.depth);
      const anchorOf = new Map<string, string>();
      for (const edge of graph.edges) if (edge.kind === "message") anchorOf.set(edge.to, edge.from);
      for (const edge of graph.edges) if (edge.kind === "message" && !anchorOf.has(edge.from)) anchorOf.set(edge.from, edge.to);
      for (const edge of graph.edges) if (edge.kind === "dispatch") anchorOf.set(edge.to, edge.from);
      const childCount = new Map<string, number>();
      const alive = new Set(ordered.map((node) => node.id));
      for (const id of nodes.keys()) if (!alive.has(id)) nodes.delete(id);

      for (const [id, existing] of nodes) {
        if (existing.fx != null) continue;
        existing.fx = existing.x;
        existing.fy = existing.y;
        held.add(id);
      }

      ordered.forEach((node, i) => {
        if (nodes.has(node.id)) return;
        const anchorId = anchorOf.get(node.id);
        const anchor = anchorId === undefined ? undefined : nodes.get(anchorId);
        let x = 0;
        let y = 0;
        if (anchor) {
          const index = childCount.get(anchor.id) ?? 0;
          childCount.set(anchor.id, index + 1);
          const angle = (index + i) * GOLDEN_ANGLE;
          const radius = parameters.distance * (1 + (random() - 0.5) * PLACEMENT_JITTER);
          x = anchor.x + Math.cos(angle) * radius;
          y = anchor.y + Math.sin(angle) * radius;
        } else if (node.id !== graph.rootId) {
          const angle = (i / ordered.length) * 2 * Math.PI;
          x = Math.cos(angle) * parameters.distance;
          y = Math.sin(angle) * parameters.distance;
        }
        nodes.set(node.id, { id: node.id, x, y, vx: 0, vy: 0 });
      });

      degrees.clear();
      for (const edge of graph.edges) {
        degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
        degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
      }
      simulation.nodes([...nodes.values()]);
      links.links(
        graph.edges
          .filter((edge) => nodes.has(edge.from) && nodes.has(edge.to))
          .map((edge) => ({ source: edge.from, target: edge.to, kind: edge.kind })),
      );
      applyForces();
      reheatTo(hadNodes ? GRAPH_GROW_ALPHA : GRAPH_CHANGE_ALPHA);
      return true;
    },
    setForces(next) {
      parameters = { ...parameters, ...next };
      applyForces();
      reheatTo(GRAPH_CHANGE_ALPHA);
    },
    pin(id, x, y) {
      const node = nodes.get(id);
      if (!node) return;
      releaseHeld();
      node.fx = x;
      node.fy = y;
      node.x = x;
      node.y = y;
      reheatTo(simulation.alphaTarget());
    },
    unpin(id) {
      const node = nodes.get(id);
      if (!node) return;
      node.fx = null;
      node.fy = null;
    },
    reheat(alphaTarget = 0) {
      simulation.alphaTarget(alphaTarget);
      reheatTo(Math.max(alphaTarget, ALPHA_MIN * 2));
    },
    settle,
    step() {
      simulation.tick();
      report();
    },
    get positions() {
      return nodes;
    },
    get alpha() {
      return simulation.alpha();
    },
    get running() {
      return frame !== null;
    },
    forces: () => ({ ...parameters }),
    centringOf: (id) => centringStrength(parameters.center, parameters.hubPull, degrees.get(id) ?? 0),
    dispose() {
      if (frame !== null) cancel(frame);
      frame = null;
      simulation.stop();
    },
  };
}
