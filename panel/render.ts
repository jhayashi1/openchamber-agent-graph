import {
  boundsOf,
  DEFAULT_FIT_MAX_SCALE,
  fitCamera,
  LABEL_MIN_SCALE,
  panBy,
  ZOOM_LIMITS,
  zoomAt,
  type Camera,
} from "./camera";
import { kindIconGroup, kindIconSvg } from "./icons";
import { ERROR_COLOR, LEGEND_KINDS, type ActivityCall, type PulseEvent } from "./activity";
import { createFocusView, type FocusSession } from "./focus";
import { nodeColor, type PaletteId } from "./color";
import { createSimulation, type ForceParameters, type GraphSimulation, type Point } from "./force";
import { recencyOpacity, type AgentGraph, type AgentGraphEdge, type AgentGraphNode } from "./graph";
import { autoPauseRange, DEFAULT_SETTINGS, type AgentGraphSettings } from "./settings";
import { createSettingsPopover, settingsCss } from "./settings-ui";

const SVG_NS = "http://www.w3.org/2000/svg";
const NODE_RADIUS = 10;
const CURRENT_RADIUS = 13;
const FIT_RADIUS = CURRENT_RADIUS + 14;
const FIT_PADDING = 24;
const LABEL_FONT_SIZE = 11;
const LABEL_GAP = 8;
const LABEL_LINE_HEIGHT = 13;
const TITLE_MAX_CHARS = 28;
const SAVE_DEBOUNCE_MS = 300;
const MESSAGE_CURVE = 0.18;
const MESSAGE_HIT_WIDTH = 12;
const PULSE_SECONDS = 1.6;
const PULSE_STAGGER_SECONDS = 0.43;
const TOOL_PULSE_MS = 800;
const TOOL_PULSE_MAX_PER_NODE = 6;
const TOOL_PULSE_MAX_DOTS = 3;
const MIN_LABEL_OPACITY = 0.6;
const DRAG_THRESHOLD = 4;
const DRAG_ALPHA_TARGET = 0.3;
const WHEEL_SENSITIVITY = 0.002;

/** Safety net only: the pass normally ends on the CSS animationend event. */
const BEAM_END_MARGIN_MS = 500;
const FIRST_BEAM_MIN_SECONDS = 2;

const css = `
${settingsCss}
.ag-root { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; font-family: var(--oc-font, system-ui, sans-serif); color: var(--oc-fg, currentColor); }
.ag-root { --ag-message-color: light-dark(#0891b2, #22d3ee); --ag-message-opacity: 0.25; --ag-beam-stroke: color-mix(in srgb, var(--oc-primary, #3b82f6) 70%, white); --ag-beam-glow: var(--oc-primary, #3b82f6); --ag-beam-width: 2; --ag-beam-dash: 24px; --ag-beam-seconds: 2s; }
.ag-header { display: flex; gap: 8px; align-items: center; font-size: 11px; margin-bottom: 8px; }
.ag-header-stat { color: var(--oc-muted, gray); white-space: nowrap; }
.ag-header-note { color: var(--oc-muted, gray); white-space: nowrap; font-size: 11px; opacity: 0.8; cursor: help; }
.ag-stage { flex: 1; min-height: 0; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; }
.ag-stage svg { display: block; width: 100%; height: 100%; }
.ag-stage { position: relative; }
.ag-edge { stroke: var(--oc-muted, gray); stroke-width: 1; opacity: 0.6; }
.ag-beam { stroke: var(--ag-beam-stroke); stroke-width: var(--ag-beam-width); stroke-linecap: round; fill: none; pointer-events: none; stroke-dasharray: var(--ag-beam-dash) 100000px; stroke-dashoffset: var(--ag-beam-dash); filter: drop-shadow(0 0 3px var(--ag-beam-glow)); }
.ag-no-glow .ag-beam { filter: none; }
.ag-no-beams .ag-beam { display: none; }
.ag-message-edge { stroke: var(--ag-message-color); stroke-width: 1.5; stroke-dasharray: 5 4; fill: none; opacity: var(--ag-message-opacity); }
.ag-message-hit { stroke: transparent; stroke-width: ${MESSAGE_HIT_WIDTH}px; fill: none; pointer-events: stroke; }
.ag-beam.ag-message-beam { stroke: color-mix(in srgb, var(--ag-message-color) 80%, white); filter: drop-shadow(0 0 3px var(--ag-message-color)); }
.ag-beam.is-travelling { animation: ag-beam-travel var(--ag-beam-seconds) linear; }
@keyframes ag-beam-travel { from { stroke-dashoffset: var(--ag-beam-dash); } to { stroke-dashoffset: calc(var(--beam-length) * -1); } }
@media (prefers-reduced-motion: reduce) { .ag-beam { display: none; } }
.ag-stage.ag-dragging, .ag-stage.ag-dragging .ag-node { cursor: grabbing; }
.ag-node { cursor: pointer; outline: none; }
.ag-body, .ag-backdrop { transform-box: fill-box; transform-origin: center; transition: transform 0.12s; }
.ag-backdrop { fill: var(--oc-bg, #fff); }
.ag-node:hover .ag-body, .ag-node:focus-visible .ag-body { filter: brightness(1.25); }
.ag-node:hover .ag-body, .ag-node:focus-visible .ag-body, .ag-node:hover .ag-backdrop, .ag-node:focus-visible .ag-backdrop { transform: scale(1.15); }
.ag-halo { opacity: 0; pointer-events: none; transform-box: fill-box; transform-origin: center; }
.ag-node.is-running .ag-halo { animation: ag-pulse ${PULSE_SECONDS}s ease-out infinite; animation-delay: var(--pulse-delay, 0s); }
.ag-node.is-running .ag-halo-late { animation-delay: calc(var(--pulse-delay, 0s) - ${PULSE_SECONDS / 2}s); }
.ag-no-pulse .ag-node.is-running .ag-halo { animation: none; }
.ag-no-waiting-glow .ag-node.is-waiting .ag-halo:not(.ag-halo-late), .ag-no-waiting-glow .ag-node.is-waiting .ag-body, .ag-no-waiting-glow .ag-node.is-waiting .ag-backdrop { animation: none; }
@keyframes ag-pulse { from { transform: scale(1); opacity: 0.6; } to { transform: scale(2.2); opacity: 0; } }
.ag-node.is-waiting .ag-halo:not(.ag-halo-late) { fill: var(--oc-warning, #d97706); transform: scale(1.7); animation: ag-breathe-glow 2.4s ease-in-out infinite alternate; }
.ag-node.is-waiting .ag-body, .ag-node.is-waiting .ag-backdrop { animation: ag-breathe 2.4s ease-in-out infinite alternate; }
@keyframes ag-breathe { from { scale: 1; } to { scale: 1.18; } }
@keyframes ag-breathe-glow { from { opacity: 0.15; } to { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) {
  .ag-node.is-waiting .ag-halo:not(.ag-halo-late), .ag-node.is-waiting .ag-body, .ag-node.is-waiting .ag-backdrop { animation: none; }
  .ag-node.is-waiting .ag-halo:not(.ag-halo-late) { opacity: 0.35; }
  .ag-node.is-running .ag-halo { animation: none; transform: scale(1.6); opacity: 0.25; }
  .ag-node.is-running .ag-halo-late { display: none; }
}
.ag-legend { position: absolute; left: 8px; bottom: 8px; display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--oc-muted, gray); pointer-events: none; }
.ag-legend-line { width: 16px; height: 0; margin-left: 4px; border-top: 2px solid var(--oc-muted, gray); }
.ag-legend-line-message { border-top: 2px dashed var(--ag-message-color); }
.ag-legend-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--oc-muted, gray); }
.ag-legend-dot-old { opacity: 0.35; }
.ag-legend-dot-new { margin-left: 4px; background: var(--oc-fg, currentColor); }
.ag-tool-pulse { pointer-events: none; color: var(--oc-fg, currentColor); animation: ag-tool-out ${TOOL_PULSE_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards; }
.ag-tool-pulse.is-end { animation-name: ag-tool-end; }
.ag-tool-pulse.is-still { animation: none; opacity: 0.85; }
.ag-tool-flash { pointer-events: none; animation: ag-tool-flash 450ms ease-out forwards; }
@keyframes ag-tool-flash { from { opacity: 0.8; } to { opacity: 0; } }
.ag-tool-count { pointer-events: none; font-size: 9px; font-weight: 700; fill: var(--oc-fg, currentColor); animation: ag-tool-out ${TOOL_PULSE_MS}ms ease-out forwards; }
@keyframes ag-tool-out { 0% { transform: translate(var(--sx), var(--sy)) scale(0.4); opacity: 0; } 20% { transform: translate(var(--sx), var(--sy)) scale(1.2); opacity: 1; } 35% { transform: translate(var(--sx), var(--sy)) scale(1); opacity: 1; } 100% { transform: translate(var(--tx), var(--ty)) scale(1); opacity: 0; } }
@keyframes ag-tool-end { 0% { transform: translate(var(--sx), var(--sy)) scale(0.5); opacity: 0; } 25% { transform: translate(var(--sx), var(--sy)) scale(1); opacity: 0.55; } 100% { transform: translate(var(--tx), var(--ty)) scale(1); opacity: 0; } }
.ag-legend-kinds { bottom: 24px; flex-wrap: wrap; gap: 3px 4px; right: 8px; }
.ag-legend-kinds[hidden] { display: none; }
.ag-legend-kind svg { width: 12px; height: 12px; color: var(--oc-fg, currentColor); flex: none; }
.ag-legend-kind { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; margin-right: 4px; }
.ag-focused > .ag-header, .ag-focused > .ag-stage { display: none; }
.ag-label { opacity: 0; transition: opacity 0.15s; pointer-events: none; font-size: ${LABEL_FONT_SIZE}px; paint-order: stroke; stroke: var(--oc-bg, #fff); stroke-width: 3px; stroke-linejoin: round; }
.ag-labels-on .ag-label, .ag-node:hover .ag-label, .ag-node:focus-visible .ag-label { opacity: var(--label-opacity, 1); }
.ag-label-title { font-weight: 700; fill: var(--oc-fg, currentColor); }
.ag-label-agent { fill: var(--oc-muted, gray); }
`;

type NodeView = {
  group: SVGGElement;
  body: SVGCircleElement;
  backdrop: SVGCircleElement;
  halos: SVGCircleElement[];
  label: SVGGElement;
  titleText: SVGTextElement;
  agentText: SVGTextElement;
  tooltip: SVGTitleElement;
  radius: number;
  pulses: SVGElement[];
};

type Gesture = { kind: "pan" } | { kind: "node"; id: string };

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

function isRunning(node: AgentGraphNode): boolean {
  return node.activity === "running" || node.activity === "retrying";
}

function waitingMessage(node: AgentGraphNode): string | null {
  if (node.activity === "waiting-question") return "Waiting for your answer";
  if (node.activity === "waiting-permission") return "Waiting for your permission";
  return null;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function relativeTime(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / 1440)} d ago`;
}

function truncate(text: string): string {
  return text.length > TITLE_MAX_CHARS ? `${text.slice(0, TITLE_MAX_CHARS - 1)}…` : text;
}

function createNodeView(id: string, pulseIndex: number, palette: PaletteId): NodeView {
  const group = svgElement("g", { class: "ag-node", role: "button", tabindex: 0, "data-session-id": id });
  const tooltip = svgElement("title");
  const color = nodeColor(id, palette);
  const halos = ["ag-halo", "ag-halo ag-halo-late"].map((name) => svgElement("circle", { class: name, fill: color }));
  const backdrop = svgElement("circle", { class: "ag-backdrop" });
  const body = svgElement("circle", { class: "ag-body", fill: color });
  const titleText = svgElement("text", { class: "ag-label-title", "text-anchor": "middle", y: LABEL_FONT_SIZE });
  const agentText = svgElement("text", {
    class: "ag-label-agent",
    "text-anchor": "middle",
    y: LABEL_FONT_SIZE + LABEL_LINE_HEIGHT,
  });
  const label = svgElement("g", { class: "ag-label" });
  label.append(titleText, agentText);
  group.style.setProperty("--pulse-delay", `${-pulseIndex * PULSE_STAGGER_SECONDS}s`);
  group.append(tooltip, ...halos, backdrop, body, label);
  return { group, body, backdrop, halos, label, titleText, agentText, tooltip, radius: NODE_RADIUS, pulses: [] };
}

function setNodeOpacity(view: NodeView, opacity: number) {
  view.body.style.opacity = String(opacity);
  view.label.style.setProperty("--label-opacity", String(Math.max(opacity, MIN_LABEL_OPACITY)));
}

function syncNodeView(view: NodeView, node: AgentGraphNode, opacity: number) {
  view.radius = node.isCurrent ? CURRENT_RADIUS : NODE_RADIUS;
  view.group.classList.toggle("is-current", node.isCurrent);
  view.group.setAttribute("aria-label", `${node.title} (${node.label})`);
  const waiting = waitingMessage(node);
  view.tooltip.textContent = [
    node.title,
    `Agent: ${node.label}`,
    `Activity: ${node.activity}`,
    ...(waiting ? [waiting] : []),
    `Started ${relativeTime(node.createdAt)}`,
  ].join("\n");
  view.group.classList.toggle("is-running", isRunning(node));
  view.group.classList.toggle("is-waiting", waiting !== null);
  for (const circle of [view.backdrop, view.body, ...view.halos]) circle.setAttribute("r", String(view.radius));
  setNodeOpacity(view, opacity);
  view.titleText.textContent = truncate(node.title);
  view.agentText.textContent = node.label;
}

export function createGraphView(
  container: Element,
  onSelect: (sessionId: string) => void,
  options: {
    settings?: AgentGraphSettings;
    onSettingsSave?: (settings: AgentGraphSettings) => void;
    sections?: readonly string[];
    onSectionsSave?: (sections: string[]) => void;
    /** An id when the focus view opens, null when it closes. */
    onFocusChange?: (sessionId: string | null) => void;
  } = {},
): {
  update(graph: AgentGraph): void;
  /** Feeds polled calls of the focused session into the open focus view. */
  focusActivity(calls: readonly ActivityCall[]): void;
  setMessagesOff(reason: string | null): void;
  pulse(events: readonly PulseEvent[]): void;
  setSettings(settings: AgentGraphSettings): void;
  setSections(sections: readonly string[]): void;
  dispose(): void;
} {
  if (!document.getElementById("ag-style")) {
    const style = document.createElement("style");
    style.id = "ag-style";
    style.textContent = css;
    document.head.append(style);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "ag-root";
  const header = document.createElement("div");
  header.className = "ag-header";
  const headerAgents = header.appendChild(document.createElement("span"));
  headerAgents.className = "ag-header-stat";
  const headerRunning = header.appendChild(document.createElement("span"));
  headerRunning.className = "ag-header-stat";
  const headerNote = header.appendChild(document.createElement("span"));
  headerNote.className = "ag-header-note";
  headerNote.hidden = true;
  const fitButton = document.createElement("button");
  fitButton.className = "ag-icon-button ag-fit";
  fitButton.type = "button";
  fitButton.setAttribute("aria-label", "Fit graph to view");
  fitButton.title = "Fit graph to view";
  const fitIcon = svgElement("svg");
  fitIcon.setAttribute("viewBox", "0 0 24 24");
  fitIcon.setAttribute("aria-hidden", "true");
  const fitPath = svgElement("path");
  fitPath.setAttribute("d", "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5");
  fitPath.setAttribute("fill", "none");
  fitPath.setAttribute("stroke", "currentColor");
  fitPath.setAttribute("stroke-width", "2");
  fitPath.setAttribute("stroke-linecap", "round");
  fitPath.setAttribute("stroke-linejoin", "round");
  fitIcon.append(fitPath);
  fitButton.append(fitIcon);

  let settings = options.settings ?? DEFAULT_SETTINGS;
  const popover = createSettingsPopover(settings, (next) => {
    applySettings(next);
    scheduleSave(next);
  }, options.sections, options.onSectionsSave);
  const headerButtons = header.appendChild(document.createElement("div"));
  headerButtons.className = "ag-header-buttons";
  headerButtons.append(popover.button, fitButton);
  wrapper.append(popover.panel);

  const stage = document.createElement("div");
  stage.className = "ag-stage";
  const svg = svgElement("svg");
  const world = svgElement("g");
  const lineLayer = svgElement("g");
  const beamLayer = svgElement("g");
  const nodeLayer = svgElement("g");
  world.append(lineLayer, beamLayer, nodeLayer);
  svg.append(world);
  const legend = document.createElement("div");
  legend.className = "ag-legend";
  const olderDot = document.createElement("span");
  olderDot.className = "ag-legend-dot ag-legend-dot-old";
  const newerDot = document.createElement("span");
  newerDot.className = "ag-legend-dot ag-legend-dot-new";
  const dispatchKey = document.createElement("span");
  dispatchKey.className = "ag-legend-line";
  const messageKey = document.createElement("span");
  messageKey.className = "ag-legend-line ag-legend-line-message";
  legend.append(olderDot, "older", newerDot, "newer", dispatchKey, "dispatch", messageKey, "message");
  const kindLegend = document.createElement("div");
  kindLegend.className = "ag-legend ag-legend-kinds";
  for (const kind of LEGEND_KINDS) {
    const item = document.createElement("span");
    item.className = "ag-legend-kind";
    item.append(kindIconSvg(kind, 12), kind);
    kindLegend.append(item);
  }
  stage.append(svg, legend, kindLegend);
  wrapper.prepend(header, stage);
  container.replaceChildren(wrapper);

  const listeners = new AbortController();
  const { signal } = listeners;

  let lastGraph: AgentGraph | null = null;
  const focus = createFocusView(wrapper, {
    onOpenChat: onSelect,
    onChange: options.onFocusChange,
    onClosed: (id) => {
      wrapper.classList.remove("ag-focused");
      nodeViews.get(id)?.group.focus();
    },
  });

  function focusSessionOf(id: string): FocusSession | null {
    const node = lastGraph?.nodes.find((entry) => entry.id === id);
    if (!node || !lastGraph) return null;
    const children = lastGraph.edges
      .filter((edge) => edge.kind === "dispatch" && edge.from === id)
      .map((edge) => {
        const child = lastGraph?.nodes.find((entry) => entry.id === edge.to);
        return { id: edge.to, title: child?.title ?? edge.to, running: child ? ["running", "retrying", "waiting-question", "waiting-permission"].includes(child.activity) : false };
      });
    return { id, title: node.title, label: node.label, color: nodeColor(id, settings.nodePalette), activity: node.activity, children };
  }

  function openFocus(id: string) {
    const session = focusSessionOf(id);
    if (!session) return;
    popover.setOpen(false);
    wrapper.classList.add("ag-focused");
    focus.openFocus(session);
  }

  let positions: ReadonlyMap<string, Point> = new Map();
  let simulation: GraphSimulation;
  let camera: Camera = { x: 0, y: 0, scale: 1 };
  let userMoved = false;
  const nodeViews = new Map<string, NodeView>();
  type EdgeView = {
    from: string;
    to: string;
    kind: AgentGraphEdge["kind"];
    line: SVGLineElement | SVGPathElement;
    beam: SVGLineElement | SVGPathElement;
    hit?: SVGPathElement;
    tooltip?: SVGTitleElement;
    timer?: ReturnType<typeof setTimeout>;
  };
  const edgeViews = new Map<string, EdgeView>();
  let nodesCreated = 0;
  const pulseTimers = new Set<ReturnType<typeof setTimeout>>();
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  function applyCamera() {
    world.setAttribute("transform", `translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
    svg.classList.toggle("ag-labels-on", camera.scale >= LABEL_MIN_SCALE);
    for (const edge of edgeViews.values()) setBeamLength(edge);
    for (const view of nodeViews.values()) {
      const offset = view.radius + LABEL_GAP / camera.scale;
      view.label.setAttribute("transform", `translate(0 ${offset}) scale(${1 / camera.scale})`);
    }
  }

  function startBeamLoop(edge: EdgeView) {
    edge.beam.classList.add("is-travelling");
    const endPass = () => {
      clearTimeout(edge.timer);
      edge.beam.removeEventListener("animationend", endPass);
      edge.beam.removeEventListener("animationcancel", endPass);
      edge.beam.classList.remove("is-travelling");
      if (edge.beam.isConnected && settings.beamsOn) scheduleBeam(edge);
    };
    edge.beam.addEventListener("animationend", endPass);
    edge.beam.addEventListener("animationcancel", endPass);
    const fallback = () => {
      const running = edge.beam.getAnimations?.().some((animation) => animation.playState === "running") ?? false;
      if (running) edge.timer = setTimeout(fallback, BEAM_END_MARGIN_MS);
      else endPass();
    };
    edge.timer = setTimeout(fallback, settings.beamSeconds * 1000 + BEAM_END_MARGIN_MS);
  }

  /** The first pass of an edge waits FIRST_BEAM_MIN_SECONDS to the pause maximum, so beams appear soon after a render. */
  function scheduleBeam(edge: EdgeView, first = false) {
    clearTimeout(edge.timer);
    if (!settings.beamsOn) return;
    const range = settings.autoPause ? autoPauseRange(nodeViews.size) : { min: settings.beamPauseMin, max: settings.beamPauseMax };
    const min = first ? Math.min(FIRST_BEAM_MIN_SECONDS, range.max) : range.min;
    edge.timer = setTimeout(() => startBeamLoop(edge), randomBetween(min, range.max) * 1000);
  }

  function stopBeamLoops() {
    for (const edge of edgeViews.values()) clearTimeout(edge.timer);
  }

  function setBeamLength(edge: EdgeView) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return;
    const chord = Math.hypot(to.x - from.x, to.y - from.y);
    const worldLength =
      edge.beam instanceof SVGPathElement && typeof edge.beam.getTotalLength === "function"
        ? edge.beam.getTotalLength()
        : chord;
    edge.beam.style.setProperty("--beam-length", `${worldLength * camera.scale}px`);
  }

  function placeEdge(edge: EdgeView) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return;
    if (edge.kind === "message") {
      const controlX = (from.x + to.x) / 2 + (from.y - to.y) * MESSAGE_CURVE;
      const controlY = (from.y + to.y) / 2 + (to.x - from.x) * MESSAGE_CURVE;
      const d = `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
      for (const path of [edge.line, edge.beam, edge.hit]) path?.setAttribute("d", d);
    } else {
      for (const line of [edge.line, edge.beam]) {
        line.setAttribute("x1", String(from.x));
        line.setAttribute("y1", String(from.y));
        line.setAttribute("x2", String(to.x));
        line.setAttribute("y2", String(to.y));
      }
    }
    setBeamLength(edge);
  }

  function fit() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width === 0 || height === 0 || positions.size === 0) return;
    camera = fitCamera(boundsOf(positions.values(), FIT_RADIUS), { width, height }, FIT_PADDING, {
      minScale: ZOOM_LIMITS.minScale,
      maxScale: DEFAULT_FIT_MAX_SCALE,
    });
    applyCamera();
  }

  function refit() {
    userMoved = false;
    fit();
  }

  function placeNodeView(id: string) {
    const position = positions.get(id);
    nodeViews.get(id)?.group.setAttribute("transform", `translate(${position?.x ?? 0} ${position?.y ?? 0})`);
  }

  function placeNode(id: string) {
    placeNodeView(id);
    for (const edge of edgeViews.values()) {
      if (edge.from !== id && edge.to !== id) continue;
      placeEdge(edge);
    }
  }

  function stagePoint(event: MouseEvent): Point {
    const rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  const pointers = new Map<number, Point>();
  let gesture: Gesture | null = null;
  let dragged = false;
  let origin: Point = { x: 0, y: 0 };
  let last: Point = origin;

  stage.addEventListener(
    "pointerdown",
    (event) => {
      const point = stagePoint(event);
      pointers.set(event.pointerId, point);
      if (pointers.size === 2) {
        if (gesture?.kind === "node" && dragged) {
          simulation.reheat(0);
          stage.classList.remove("ag-dragging");
        }
        gesture = null;
        dragged = true;
        for (const pointerId of pointers.keys()) stage.setPointerCapture(pointerId);
        return;
      }
      const target = event.target instanceof Element ? event.target.closest(".ag-node") : null;
      const id = target?.getAttribute("data-session-id");
      gesture = id ? { kind: "node", id } : { kind: "pan" };
      dragged = false;
      origin = point;
      last = point;
    },
    { signal },
  );

  stage.addEventListener(
    "pointermove",
    (event) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const point = stagePoint(event);
      pointers.set(event.pointerId, point);

      if (pointers.size >= 2) {
        const others = [...pointers].filter(([pointerId]) => pointerId !== event.pointerId);
        const other = others[0]?.[1];
        if (!other) return;
        const oldDistance = Math.max(Math.hypot(previous.x - other.x, previous.y - other.y), 1);
        const newDistance = Math.hypot(point.x - other.x, point.y - other.y);
        const oldMiddle = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 };
        const newMiddle = { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 };
        camera = zoomAt(camera, oldMiddle, newDistance / oldDistance, ZOOM_LIMITS);
        camera = panBy(camera, newMiddle.x - oldMiddle.x, newMiddle.y - oldMiddle.y);
        userMoved = true;
        applyCamera();
        return;
      }

      if (!gesture) return;
      if (!dragged) {
        if (Math.hypot(point.x - origin.x, point.y - origin.y) < DRAG_THRESHOLD) return;
        dragged = true;
        stage.setPointerCapture(event.pointerId);
        if (gesture.kind === "node") {
          userMoved = true;
          stage.classList.add("ag-dragging");
          simulation.reheat(DRAG_ALPHA_TARGET);
        }
      }
      const dx = point.x - last.x;
      const dy = point.y - last.y;
      last = point;
      if (gesture.kind === "pan") {
        camera = panBy(camera, dx, dy);
        userMoved = true;
        applyCamera();
        return;
      }
      const position = positions.get(gesture.id);
      if (!position) return;
      simulation.pin(gesture.id, position.x + dx / camera.scale, position.y + dy / camera.scale);
      placeNode(gesture.id);
    },
    { signal },
  );

  const endPointer = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size === 0) {
      if (gesture?.kind === "node" && dragged) {
        simulation.reheat(0);
      }
      stage.classList.remove("ag-dragging");
      gesture = null;
    }
  };
  stage.addEventListener("pointerup", endPointer, { signal });
  stage.addEventListener("pointercancel", endPointer, { signal });
  stage.addEventListener("lostpointercapture", endPointer, { signal });

  stage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      camera = zoomAt(camera, stagePoint(event), Math.exp(-event.deltaY * WHEEL_SENSITIVITY), ZOOM_LIMITS);
      userMoved = true;
      applyCamera();
    },
    { passive: false, signal },
  );

  stage.addEventListener(
    "dblclick",
    (event) => {
      if (event.target instanceof Element && event.target.closest(".ag-node")) return;
      refit();
    },
    { signal },
  );
  fitButton.addEventListener("click", refit, { signal });

  const resizeObserver = new ResizeObserver(() => {
    if (!userMoved) fit();
  });
  resizeObserver.observe(stage);

  const forcesOf = (value: AgentGraphSettings): ForceParameters => ({
    center: value.centerForce,
    hubPull: value.hubPull,
    repel: value.repelForce,
    link: value.linkForce,
    distance: value.linkDistance,
  });
  function placeAll() {
    for (const id of nodeViews.keys()) placeNodeView(id);
    for (const edge of edgeViews.values()) placeEdge(edge);
  }
  simulation = createSimulation({
    animate: !reducedMotion,
    forces: forcesOf(settings),
    onTick: (next) => {
      positions = next;
      placeAll();
    },
  });
  positions = simulation.positions;

  let lastOpacities = new Map<string, number>();
  const nodeOpacity = (id: string) => (settings.recencyFade ? (lastOpacities.get(id) ?? 1) : 1);

  function applySettings(next: AgentGraphSettings) {
    const beamsToggled = settings.beamsOn !== next.beamsOn;
    settings = next;
    wrapper.classList.toggle("ag-no-beams", !next.beamsOn);
    if (beamsToggled) {
      for (const edge of edgeViews.values()) {
        clearTimeout(edge.timer);
        edge.beam.classList.remove("is-travelling");
        if (next.beamsOn && !reducedMotion) scheduleBeam(edge, true);
      }
    }
    const style = wrapper.style;
    const custom = (value: string, theme: string) => (value === "theme" ? theme : value);
    style.setProperty("--ag-beam-stroke", custom(next.beamColor, "color-mix(in srgb, var(--oc-primary, #3b82f6) 70%, white)"));
    style.setProperty("--ag-beam-glow", custom(next.beamColor, "var(--oc-primary, #3b82f6)"));
    style.setProperty("--ag-beam-width", String(next.beamWidth));
    style.setProperty("--ag-beam-dash", `${next.beamLength}px`);
    style.setProperty("--ag-beam-seconds", `${next.beamSeconds}s`);
    style.setProperty("--ag-message-opacity", String(next.messageOpacity / 100));
    if (next.messageColor === "theme") style.removeProperty("--ag-message-color");
    else style.setProperty("--ag-message-color", next.messageColor);
    wrapper.classList.toggle("ag-no-glow", !next.beamGlow);
    kindLegend.hidden = !next.toolPulses;
    if (!next.toolPulses) clearToolPulses();
    wrapper.classList.toggle("ag-no-pulse", !next.pulseRunning);
    wrapper.classList.toggle("ag-no-waiting-glow", !next.waitingGlow);
    for (const [id, view] of nodeViews) {
      setNodeOpacity(view, nodeOpacity(id));
      const color = nodeColor(id, next.nodePalette);
      for (const circle of [view.body, ...view.halos]) circle.setAttribute("fill", color);
    }
    const forces = forcesOf(next);
    const old = simulation?.forces();
    if (simulation && old && (Object.keys(forces) as Array<keyof ForceParameters>).some((key) => forces[key] !== old[key])) {
      simulation.setForces(forces);
    }
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleSave(next: AgentGraphSettings) {
    if (!options.onSettingsSave) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => options.onSettingsSave?.(next), SAVE_DEBOUNCE_MS);
  }

  function setSettings(next: AgentGraphSettings) {
    applySettings(next);
    popover.sync(next);
  }
  applySettings(settings);

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && popover.isOpen()) popover.setOpen(false, true);
    },
    { signal },
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!popover.isOpen() || !(event.target instanceof Node)) return;
      if (popover.panel.contains(event.target) || popover.button.contains(event.target)) return;
      popover.setOpen(false);
    },
    { signal },
  );

  function update(graph: AgentGraph) {
    lastGraph = graph;
    const focusedId = focus.focusedId();
    if (focusedId !== null) {
      const session = focusSessionOf(focusedId);
      if (session) focus.update(session);
    }
    headerAgents.textContent = `${graph.nodes.length} agents`;
    popover.setNodeCount(graph.nodes.length);
    headerRunning.textContent = `${graph.nodes.filter(isRunning).length} running`;

    const firstUpdate = nodeViews.size === 0 && positions.size === 0;
    const structureChanged = simulation.setGraph(graph);
    if (firstUpdate) simulation.settle();
    positions = simulation.positions;

    const ids = new Set(graph.nodes.map((node) => node.id));
    for (const [id, view] of nodeViews) {
      if (ids.has(id)) continue;
      view.group.remove();
      nodeViews.delete(id);
    }
    const opacities = recencyOpacity(graph.nodes);
    lastOpacities = opacities;
    for (const node of graph.nodes) {
      let view = nodeViews.get(node.id);
      if (!view) {
        view = createNodeView(node.id, nodesCreated++, settings.nodePalette);
        const id = node.id;
        view.group.addEventListener(
          "click",
          () => {
            if (!dragged) openFocus(id);
          },
          { signal },
        );
        view.group.addEventListener(
          "keydown",
          (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openFocus(id);
          },
          { signal },
        );
        nodeViews.set(node.id, view);
        nodeLayer.append(view.group);
      }
      syncNodeView(view, node, nodeOpacity(node.id));
    }

    const edgeKey = (edge: AgentGraphEdge) => `${edge.kind}:${edge.from}->${edge.to}`;
    const edgeKeys = new Set(graph.edges.map(edgeKey));
    for (const [key, edge] of edgeViews) {
      if (edgeKeys.has(key)) continue;
      clearTimeout(edge.timer);
      edge.line.remove();
      edge.beam.remove();
      edge.hit?.remove();
      edgeViews.delete(key);
    }
    const titleOf = (id: string) => graph.nodes.find((node) => node.id === id)?.title ?? id;
    for (const graphEdge of graph.edges) {
      const key = edgeKey(graphEdge);
      let edge = edgeViews.get(key);
      if (!edge) {
        const isMessage = graphEdge.kind === "message";
        const tag = isMessage ? "path" : "line";
        edge = {
          from: graphEdge.from,
          to: graphEdge.to,
          kind: graphEdge.kind,
          line: svgElement(tag, {
            class: isMessage ? "ag-edge ag-message-edge" : "ag-edge",
            "vector-effect": "non-scaling-stroke",
          }),
          beam: svgElement(tag, {
            class: isMessage ? "ag-beam ag-message-beam" : "ag-beam",
            "vector-effect": "non-scaling-stroke",
          }),
        };
        if (isMessage) {
          edge.tooltip = svgElement("title");
          edge.hit = svgElement("path", { class: "ag-message-hit", "vector-effect": "non-scaling-stroke" });
          edge.hit.append(edge.tooltip);
          lineLayer.append(edge.hit);
        }
        edgeViews.set(key, edge);
        lineLayer.append(edge.line);
        beamLayer.append(edge.beam);
        if (!reducedMotion) scheduleBeam(edge, true);
      }
      if (graphEdge.kind === "message" && edge.tooltip) {
        const noun = graphEdge.count === 1 ? "message" : "messages";
        edge.tooltip.textContent = `${titleOf(graphEdge.from)} -> ${titleOf(graphEdge.to)}: ${graphEdge.count} ${noun}, last ${relativeTime(graphEdge.lastAt)}`;
      }
    }
    placeAll();

    if (!userMoved && structureChanged) fit();
  }

  function clearToolPulses() {
    for (const timer of pulseTimers) clearTimeout(timer);
    pulseTimers.clear();
    for (const view of nodeViews.values()) {
      for (const element of view.pulses) element.remove();
      view.pulses = [];
    }
  }

  function addToolPulse(view: NodeView, element: SVGElement) {
    view.group.append(element);
    view.pulses.push(element);
    while (view.pulses.length > TOOL_PULSE_MAX_PER_NODE) view.pulses.shift()?.remove();
    const timer = setTimeout(() => {
      pulseTimers.delete(timer);
      element.remove();
      view.pulses = view.pulses.filter((entry) => entry !== element);
    }, reducedMotion ? TOOL_PULSE_MS / 2 : TOOL_PULSE_MS + 50);
    pulseTimers.add(timer);
  }

  function pulse(events: readonly PulseEvent[]) {
    if (!settings.toolPulses) return;
    const byNode = new Map<string, PulseEvent[]>();
    for (const event of events) {
      if (!nodeViews.has(event.sessionId)) continue;
      byNode.set(event.sessionId, [...(byNode.get(event.sessionId) ?? []), event]);
    }
    for (const [id, nodeEvents] of byNode) {
      const view = nodeViews.get(id)!;
      const base = Math.random() * Math.PI * 2;
      // Icons keep the same size on screen at any zoom, like the labels.
      const screen = 1 / camera.scale;
      const shown = nodeEvents.slice(0, TOOL_PULSE_MAX_DOTS);
      shown.forEach((event, index) => {
        const angle = base + (index * Math.PI * 2) / Math.max(shown.length, 3);
        const reach = view.radius + 20 * screen;
        const isEnd = event.phase !== "start";
        const element = svgElement("g", { class: "ag-tool-pulse", "data-kind": event.kind, "data-phase": event.phase });
        element.classList.toggle("is-end", isEnd);
        element.classList.toggle("is-still", reducedMotion);
        if (event.phase === "error") element.style.color = ERROR_COLOR;
        if (reducedMotion) {
          element.append(kindIconGroup(event.kind, 16 * screen, Math.cos(angle) * (view.radius + 12 * screen), Math.sin(angle) * (view.radius + 12 * screen)));
        } else {
          element.append(kindIconGroup(event.kind, (isEnd ? 12 : 16) * screen));
          element.style.setProperty("--sx", `${Math.cos(angle) * view.radius}px`);
          element.style.setProperty("--sy", `${Math.sin(angle) * view.radius}px`);
          element.style.setProperty("--tx", `${Math.cos(angle) * reach}px`);
          element.style.setProperty("--ty", `${Math.sin(angle) * reach}px`);
        }
        if (event.phase === "error" && !reducedMotion) {
          addToolPulse(view, svgElement("circle", { class: "ag-tool-flash", r: view.radius, fill: "none", stroke: ERROR_COLOR, "stroke-width": 3 }));
        }
        addToolPulse(view, element);
      });
      if (nodeEvents.length > TOOL_PULSE_MAX_DOTS && !reducedMotion) {
        const count = svgElement("text", { class: "ag-tool-count", x: view.radius + 4 * screen, y: -view.radius });
        count.style.fontSize = `${10 * screen}px`;
        count.style.setProperty("--tx", "0px");
        count.style.setProperty("--ty", `${-10 * screen}px`);
        count.textContent = `x${nodeEvents.length}`;
        addToolPulse(view, count);
      }
    }
  }

  function dispose() {
    focus.dispose();
    clearToolPulses();
    stopBeamLoops();
    simulation.dispose();
    clearTimeout(saveTimer);
    listeners.abort();
    resizeObserver.disconnect();
    wrapper.remove();
  }

  function setMessagesOff(reason: string | null) {
    headerNote.hidden = reason === null;
    headerNote.textContent = reason === null ? "" : "messages off";
    headerNote.title = reason ?? "";
  }

  return { update, focusActivity: focus.onActivity, setMessagesOff, pulse, setSettings, setSections: popover.setSections, dispose };
}
