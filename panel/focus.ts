import { mountButton } from "@openchamber/sdk/ui";
import { kindIconGroup, kindIconSvg } from "./icons";
import { ERROR_COLOR, type ActivityCall, type ActivityKind } from "./activity";

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW = 400;
const CENTER = VIEW / 2;
const RING = 128;
const STATION_R = 19;
const HUB_R = 28;
const LABEL_GAP = 31;
const AGE_TICK_MS = 1000;
const FEED_ROWS = 16;
const MAX_CALLS = 300;
const PULSE_MS = 800;
const COMET_MS = 650;
const RIPPLE_MS = 900;
const EFFECT_MS = 950;
const HUB_TITLE_CHARS = 18;

/** Clockwise from the top, like lot-map: the user station sits at 12 o'clock. */
export const STATION_ORDER: readonly ActivityKind[] = ["user", "files", "shell", "network", "mcp", "browser", "agents", "skills", "memory", "other"];

const css = `
.ag-focus { display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 6px; }
.ag-focus[hidden] { display: none; }
.ag-focus-header { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ag-focus-titles { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ag-focus-title { font-size: 12px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ag-focus-sub { font-size: 11px; color: var(--oc-muted, gray); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ag-focus-map { flex: 1 1 auto; min-height: 180px; display: flex; }
.ag-focus-map svg { display: block; width: 100%; height: 100%; }
.ag-f-spoke { fill: none; stroke: var(--oc-muted, gray); stroke-linecap: round; }
.ag-f-ring { fill: none; stroke: var(--oc-border, gray); stroke-width: 1; opacity: 0.4; stroke-dasharray: 2 4; }
.ag-f-station-body { fill: var(--oc-bg, #fff); stroke: var(--oc-fg, gray); stroke-opacity: 0.4; stroke-width: 1.1; transform-box: fill-box; transform-origin: center; }
.ag-f-station-fill { fill: var(--oc-fg, currentColor); opacity: 0.06; }
.ag-f-station-icon { color: var(--oc-fg, currentColor); }
.ag-f-station.is-busy .ag-f-station-body { stroke-width: 1.6; stroke-opacity: 0.9; }
.ag-f-station.is-pop .ag-f-station-body { animation: ag-f-pop 420ms cubic-bezier(0.2, 0.8, 0.3, 1.2); }
.ag-f-station.is-shake { animation: ag-f-shake 380ms ease-in-out; }
.ag-f-label { font-size: 11px; fill: var(--oc-muted, gray); dominant-baseline: middle; }
.ag-f-total { font-size: 10px; font-weight: 700; fill: var(--oc-fg, currentColor); }
.ag-f-hub-glow { opacity: 0.18; pointer-events: none; }
.ag-f-idle .ag-f-hub-glow { transform-box: fill-box; transform-origin: center; animation: ag-f-breathe 6s ease-in-out infinite; }
.ag-f-idle .ag-f-ring { transform-box: fill-box; transform-origin: center; animation: ag-f-drift 120s linear infinite; }
@keyframes ag-f-breathe { 0%, 100% { transform: scale(1); opacity: 0.14; } 50% { transform: scale(1.3); opacity: 0.32; } }
@keyframes ag-f-drift { to { transform: rotate(360deg); } }
@keyframes ag-f-pop { 0% { transform: scale(1); } 40% { transform: scale(1.1); } 100% { transform: scale(1); } }
@keyframes ag-f-shake { 0%, 100% { transform: translate(0, 0); } 20% { transform: translate(-2px, 0); } 40% { transform: translate(2px, 0); } 60% { transform: translate(-1.5px, 0); } 80% { transform: translate(1px, 0); } }
.ag-f-comet { fill: none; stroke: var(--oc-fg, currentColor); stroke-width: 2; stroke-linecap: round; stroke-dasharray: 16 100; stroke-dashoffset: 16; opacity: 0.8; pointer-events: none; animation: ag-f-comet ${COMET_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }
.ag-f-comet.is-end { opacity: 0.45; animation-direction: reverse; }
.ag-f-comet.is-error { stroke: ${ERROR_COLOR}; }
@keyframes ag-f-comet { from { stroke-dashoffset: 16; } to { stroke-dashoffset: -100; } }
.ag-f-ripple { fill: none; stroke: var(--oc-fg, currentColor); stroke-width: 1.2; pointer-events: none; transform-box: fill-box; transform-origin: center; animation: ag-f-ripple ${RIPPLE_MS}ms ease-out forwards; }
.ag-f-ripple.is-error { stroke: ${ERROR_COLOR}; }
.ag-f-ripple.is-still { animation-name: ag-f-fade; }
@keyframes ag-f-ripple { from { transform: scale(1); opacity: 0.6; } to { transform: scale(1.9); opacity: 0; } }
@keyframes ag-f-fade { from { opacity: 0.6; } to { opacity: 0; } }
.ag-f-trail { pointer-events: none; color: var(--oc-fg, currentColor); opacity: 0; animation: ag-f-out ${PULSE_MS}ms cubic-bezier(0.3, 0, 0.2, 1) var(--delay) forwards; }
.ag-f-trail.is-end { animation-name: ag-f-in; }
.ag-f-running { font-size: 10px; font-weight: 700; fill: var(--oc-fg, currentColor); text-anchor: middle; paint-order: stroke; stroke: var(--oc-bg, #fff); stroke-width: 3px; stroke-linejoin: round; }
.ag-f-error-dot { fill: ${ERROR_COLOR}; stroke: var(--oc-bg, #fff); stroke-width: 1.5; }
.ag-f-error-count { font-size: 9px; font-weight: 700; fill: #fff; text-anchor: middle; dominant-baseline: central; }
.ag-f-working { fill: none; stroke: var(--oc-fg, currentColor); stroke-width: 1; stroke-linecap: round; stroke-dasharray: 3 6; opacity: 0; pointer-events: none; transform-box: fill-box; transform-origin: center; transition: opacity 400ms ease; }
.ag-f-station.is-busy .ag-f-working { opacity: 0.5; animation: ag-f-march 24s linear infinite; }
@keyframes ag-f-march { to { transform: rotate(360deg); } }
.ag-f-hub-title { font-size: 11px; font-weight: 700; fill: var(--oc-fg, currentColor); text-anchor: middle; paint-order: stroke; stroke: var(--oc-bg, #fff); stroke-width: 3px; stroke-linejoin: round; }
.ag-f-hub-ring { fill: none; stroke: var(--oc-fg, currentColor); stroke-width: 1; opacity: 0.25; }
.ag-f-pulse { pointer-events: none; color: var(--oc-fg, currentColor); animation: ag-f-out ${PULSE_MS}ms cubic-bezier(0.3, 0, 0.2, 1) forwards; }
.ag-f-pulse.is-end { animation-name: ag-f-in; }
@keyframes ag-f-out { from { transform: translate(0, 0); opacity: 0.95; } to { transform: translate(var(--tx), var(--ty)); opacity: 0.2; } }
@keyframes ag-f-in { from { transform: translate(var(--tx), var(--ty)); opacity: 0.7; } to { transform: translate(0, 0); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .ag-f-pulse, .ag-f-trail, .ag-f-comet, .ag-f-idle .ag-f-hub-glow, .ag-f-idle .ag-f-ring, .ag-f-station.is-busy .ag-f-working, .ag-f-station.is-pop .ag-f-station-body, .ag-f-station.is-shake { animation: none; } }
.ag-feed { flex: 0 0 auto; list-style: none; margin: 0; padding: 0; font-size: 11px; max-height: 38%; overflow-y: auto; border-top: 1px solid var(--oc-border, rgba(128,128,128,0.3)); }
.ag-feed-row { display: flex; align-items: center; gap: 6px; padding: 2px 2px; min-width: 0; }
.ag-feed-status { width: 12px; text-align: center; flex: none; }
.ag-feed-row.is-running .ag-feed-status { color: var(--oc-primary, #3b82f6); }
.ag-feed-row.is-error .ag-feed-status { color: ${ERROR_COLOR}; }
.ag-feed-row.is-completed .ag-feed-status { color: var(--oc-success, #16a34a); }
.ag-feed-icon svg { width: 12px; height: 12px; }
.ag-feed-icon { display: inline-flex; flex: none; color: var(--oc-fg, currentColor); }
.ag-feed-tool { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ag-feed-more { color: var(--oc-muted, gray); flex: none; }
.ag-feed-time { color: var(--oc-muted, gray); flex: none; font-variant-numeric: tabular-nums; }
.ag-feed-empty { color: var(--oc-muted, gray); padding: 4px 2px; }
`;

export type FocusSession = {
  id: string;
  title: string;
  label: string;
  color: string;
  activity: string;
  children: readonly { id: string; title: string; running: boolean }[];
};

type FocusOptions = {
  onOpenChat: (sessionId: string) => void;
  /** Called after the focus view closed (back button or Escape), with the id that was open. */
  onClosed: (sessionId: string) => void;
  /** Called when the focused session changes: an id on open, null on close. */
  onChange?: (sessionId: string | null) => void;
  now?: () => number;
};

type StationView = {
  group: SVGGElement;
  spoke: SVGLineElement;
  total: SVGTSpanElement;
  running: SVGTextElement;
  errorDot: SVGGElement;
  errorCount: SVGTextElement;
  x: number;
  y: number;
};

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

const SPOKE_WIDTH = 1;

/** Spokes stay thin; only their brightness shows how much a station was used. */
export function spokeStyle(count: number): { width: number; opacity: number } {
  return { width: SPOKE_WIDTH, opacity: Math.min(0.9, 0.15 + count / 16) };
}

function ageLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

export type FeedRow = { kind: ActivityKind; tool: string; status: ActivityCall["status"]; startedAt: number; more: number };

/** Newest first; consecutive calls at one station fold into the newest one with a count of the others. */
export function foldFeed(calls: readonly ActivityCall[], limit = FEED_ROWS): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const call of [...calls].sort((a, b) => b.startedAt - a.startedAt)) {
    const previous = rows[rows.length - 1];
    if (previous && previous.kind === call.kind) {
      previous.more += 1;
      if (call.status === "running") previous.status = "running";
      continue;
    }
    rows.push({ kind: call.kind, tool: call.tool, status: call.status, startedAt: call.startedAt, more: 0 });
  }
  return rows.slice(0, limit);
}

export function createFocusView(container: Element, options: FocusOptions) {
  if (!document.getElementById("ag-focus-style")) {
    const style = document.createElement("style");
    style.id = "ag-focus-style";
    style.textContent = css;
    document.head.append(style);
  }
  const now = options.now ?? Date.now;
  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const listeners = new AbortController();

  const root = document.createElement("div");
  root.className = "ag-focus";
  root.hidden = true;
  const header = document.createElement("div");
  header.className = "ag-focus-header";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "ag-icon-button ag-focus-back";
  back.setAttribute("aria-label", "Back to graph");
  back.title = "Back to graph";
  const backIcon = svgElement("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
  backIcon.append(
    svgElement("path", { d: "M19 12H5M11 6l-6 6 6 6", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  );
  back.append(backIcon);
  const titles = document.createElement("div");
  titles.className = "ag-focus-titles";
  const titleText = titles.appendChild(document.createElement("span"));
  titleText.className = "ag-focus-title";
  const subText = titles.appendChild(document.createElement("span"));
  subText.className = "ag-focus-sub";
  const chatSlot = document.createElement("span");
  header.append(back, titles, chatSlot);
  const chatButton = mountButton(chatSlot, { label: "Open chat", variant: "outline", size: "sm", onClick: () => current && options.onOpenChat(current.id) });

  const map = document.createElement("div");
  map.className = "ag-focus-map";
  const svg = svgElement("svg", { viewBox: `0 0 ${VIEW} ${VIEW}`, preserveAspectRatio: "xMidYMid meet", role: "img" });
  const spokeLayer = svgElement("g");
  const cometLayer = svgElement("g");
  const stationLayer = svgElement("g");
    const pulseLayer = svgElement("g");
  const hubLayer = svgElement("g");
  svg.append(svgElement("circle", { class: "ag-f-ring", cx: CENTER, cy: CENTER, r: RING }), spokeLayer, cometLayer, stationLayer, hubLayer, pulseLayer);
  map.append(svg);
  const feed = document.createElement("ol");
  feed.className = "ag-feed";
  feed.setAttribute("aria-label", "Recent tool calls");
  root.append(header, map, feed);
  container.append(root);

  const stations = new Map<ActivityKind, StationView>();
  STATION_ORDER.forEach((kind, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / STATION_ORDER.length;
    const x = CENTER + RING * Math.cos(angle);
    const y = CENTER + RING * Math.sin(angle);
    const spoke = svgElement("line", { class: "ag-f-spoke", x1: CENTER, y1: CENTER, x2: x, y2: y });
    spoke.setAttribute("data-kind", kind);
    spokeLayer.append(spoke);
    const group = svgElement("g", { class: "ag-f-station", "data-kind": kind });
    const title = svgElement("title");
    title.textContent = kind;
    const fill = svgElement("circle", { class: "ag-f-station-fill", cx: x, cy: y, r: STATION_R });
    const body = svgElement("circle", { class: "ag-f-station-body", cx: x, cy: y, r: STATION_R });
    const icon = svgElement("g", { class: "ag-f-station-icon" });
    icon.append(kindIconGroup(kind, 16, x, y));
    const side = Math.cos(angle) > 0.3 ? 1 : Math.cos(angle) < -0.3 ? -1 : 0;
    const label = svgElement("text", {
      class: "ag-f-label",
      x: side === 0 ? x : x + side * (STATION_R + 6),
      y: side === 0 ? y + Math.sign(Math.sin(angle)) * LABEL_GAP : y,
      "text-anchor": side === 0 ? "middle" : side > 0 ? "start" : "end",
    });
    label.append(kind);
    const total = svgElement("tspan", { class: "ag-f-total", dx: 4 });
    label.append(total);
    const running = svgElement("text", { class: "ag-f-running", x: x - STATION_R, y: y - STATION_R + 2 });
    const errorDot = svgElement("g", { class: "ag-f-error" });
    errorDot.append(svgElement("circle", { class: "ag-f-error-dot", cx: x + STATION_R - 2, cy: y - STATION_R + 2, r: 8 }));
    const errorCount = svgElement("text", { class: "ag-f-error-count", x: x + STATION_R - 2, y: y - STATION_R + 2 });
    errorDot.append(errorCount);
    errorDot.setAttribute("display", "none");
    const working = svgElement("circle", { class: "ag-f-working", cx: x, cy: y, r: STATION_R + 5 });
    group.append(title, fill, working, body, icon, label, running, errorDot);
    stationLayer.append(group);
    stations.set(kind, { group, spoke, total, running, errorDot, errorCount, x, y });
  });

  const hubBody = svgElement("circle", { class: "ag-f-hub", cx: CENTER, cy: CENTER, r: HUB_R });
  const hubRing = svgElement("circle", { class: "ag-f-hub-ring", cx: CENTER, cy: CENTER, r: HUB_R + 4 });
  const hubTitle = svgElement("text", { class: "ag-f-hub-title", x: CENTER, y: CENTER + HUB_R + 18 });
  const hubGlow = svgElement("circle", { class: "ag-f-hub-glow", cx: CENTER, cy: CENTER, r: HUB_R + 8 });
  hubLayer.append(hubGlow, hubRing, hubBody, hubTitle);

  let current: FocusSession | null = null;
  let calls = new Map<string, ActivityCall>();
  let seeded = false;
  const lastPhase = new Map<string, "start" | "end">();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let ageTimer: ReturnType<typeof setInterval> | null = null;

  function renderHeader(session: FocusSession) {
    titleText.textContent = session.title;
    titleText.title = session.title;
    subText.textContent = `${session.label} - ${session.activity}`;
    hubBody.setAttribute("fill", session.color);
    hubGlow.setAttribute("fill", session.color);
    hubTitle.textContent = session.title.length > HUB_TITLE_CHARS ? `${session.title.slice(0, HUB_TITLE_CHARS - 1)}…` : session.title;
    svg.setAttribute("aria-label", `${session.title}: tool activity by station`);
  }

  function renderMap() {
    const at = now();
    const all = [...calls.values()];
    for (const [kind, station] of stations) {
      const own = all.filter((call) => call.kind === kind);
      const runningChildren = kind === "agents" ? (current?.children.filter((child) => child.running).length ?? 0) : 0;
      const running = own.filter((call) => call.status === "running");
      const busy = running.length + runningChildren;
      const errors = own.filter((call) => call.status === "error").length;
      const style = spokeStyle(own.length);
      station.spoke.setAttribute("stroke-width", style.width.toFixed(2));
      station.spoke.setAttribute("stroke-opacity", style.opacity.toFixed(2));
      station.spoke.setAttribute("data-calls", String(own.length));
      station.total.textContent = own.length > 0 ? String(own.length) : "";
      station.group.classList.toggle("is-busy", busy > 0);
      station.running.textContent = busy >= 2 ? `x${busy}` : "";
      station.errorDot.setAttribute("display", errors > 0 ? "inline" : "none");
      station.errorCount.textContent = errors > 0 ? String(errors) : "";
    }
    renderFeed(at, all);
    const anyRunning = all.some((call) => call.status === "running");
    if (anyRunning && !ageTimer) ageTimer = setInterval(renderMap, AGE_TICK_MS);
    if (!anyRunning && ageTimer) {
      clearInterval(ageTimer);
      ageTimer = null;
    }
  }

  function renderFeed(at: number, all: readonly ActivityCall[]) {
    const rows = foldFeed(all);
    if (rows.length === 0) {
      const empty = document.createElement("li");
      empty.className = "ag-feed-empty";
      empty.textContent = "No tool calls yet";
      feed.replaceChildren(empty);
      return;
    }
    feed.replaceChildren(
      ...rows.map((row) => {
        const item = document.createElement("li");
        item.className = `ag-feed-row is-${row.status}`;
        item.setAttribute("data-kind", row.kind);
        const status = document.createElement("span");
        status.className = "ag-feed-status";
        status.textContent = row.status === "running" ? "…" : row.status === "error" ? "✕" : "✓";
        status.setAttribute("aria-label", row.status === "running" ? "running" : row.status === "error" ? "failed" : "done");
        const icon = document.createElement("span");
        icon.className = "ag-feed-icon";
        icon.append(kindIconSvg(row.kind, 12));
        const tool = document.createElement("span");
        tool.className = "ag-feed-tool";
        tool.textContent = row.tool;
        tool.title = `${row.kind}: ${row.tool}`;
        item.append(status, icon, tool);
        if (row.more > 0) {
          const more = document.createElement("span");
          more.className = "ag-feed-more";
          more.textContent = `+${row.more}`;
          item.append(more);
        }
        const time = document.createElement("span");
        time.className = "ag-feed-time";
        time.textContent = ageLabel(at - row.startedAt);
        item.append(time);
        return item;
      }),
    );
  }

  function pulse(kind: ActivityKind, phase: "start" | "end" | "error") {
    const station = stations.get(kind)!;
    const motion = !reducedMotion();
    const effects: SVGElement[] = [];
    const ripple = svgElement("circle", { class: "ag-f-ripple", cx: station.x, cy: station.y, r: STATION_R });
    ripple.classList.toggle("is-error", phase === "error");
    ripple.classList.toggle("is-still", !motion);
    station.group.insertBefore(ripple, station.group.firstChild);
    effects.push(ripple);
    if (motion) {
      const comet = svgElement("line", { class: "ag-f-comet", x1: CENTER, y1: CENTER, x2: station.x, y2: station.y, pathLength: 100 });
      comet.classList.toggle("is-end", phase !== "start");
      comet.classList.toggle("is-error", phase === "error");
      cometLayer.append(comet);
      effects.push(comet);
      const tx = `${station.x - CENTER}px`;
      const ty = `${station.y - CENTER}px`;
      for (const delay of [0, 70, 140]) {
        const dot = svgElement("g", { class: delay === 0 ? "ag-f-pulse" : "ag-f-trail", "data-kind": kind });
        if (delay === 0) dot.setAttribute("data-phase", phase);
        else dot.style.setProperty("--delay", `${delay}ms`);
        dot.append(kindIconGroup(kind, delay === 0 ? 12 : 10, CENTER, CENTER));
        if (delay > 0) dot.style.strokeOpacity = "0.35";
        dot.classList.toggle("is-end", phase !== "start");
        if (phase === "error") dot.style.color = ERROR_COLOR;
        dot.style.setProperty("--tx", tx);
        dot.style.setProperty("--ty", ty);
        pulseLayer.append(dot);
        effects.push(dot);
      }
      station.group.classList.remove("is-pop", "is-shake");
      void station.group.getBoundingClientRect();
      station.group.classList.add("is-pop");
      if (phase === "error") station.group.classList.add("is-shake");
    }
    const timer = setTimeout(() => {
      timers.delete(timer);
      for (const effect of effects) effect.remove();
      station.group.classList.remove("is-pop", "is-shake");
    }, EFFECT_MS);
    timers.add(timer);
  }

  function onActivity(incoming: readonly ActivityCall[]) {
    if (!current) return;
    const fresh = incoming.filter((call) => call.sessionId === current!.id);
    for (const call of [...fresh].sort((a, b) => a.startedAt - b.startedAt)) {
      const phase = lastPhase.get(call.callId);
      if (seeded) {
        if (phase === undefined) pulse(call.kind, "start");
        if (call.status !== "running" && phase !== "end") pulse(call.kind, call.status === "error" ? "error" : "end");
      }
      lastPhase.set(call.callId, call.status === "running" ? "start" : "end");
      calls.set(call.callId, call);
    }
    seeded = true;
    if (calls.size > MAX_CALLS) {
      const oldest = [...calls.values()].sort((a, b) => a.startedAt - b.startedAt).slice(0, calls.size - MAX_CALLS);
      for (const call of oldest) {
        calls.delete(call.callId);
        lastPhase.delete(call.callId);
      }
    }
    renderMap();
  }

  function reset() {
    calls = new Map();
    lastPhase.clear();
    seeded = false;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    pulseLayer.replaceChildren();
    if (ageTimer) clearInterval(ageTimer);
    ageTimer = null;
  }

  function openFocus(session: FocusSession) {
    reset();
    current = session;
    svg.classList.toggle("ag-f-idle", !reducedMotion());
    root.hidden = false;
    renderHeader(session);
    renderMap();
    options.onChange?.(session.id);
    back.focus();
  }

  /** Refreshes the header and running subagents while open; keeps the collected calls. */
  function update(session: FocusSession) {
    if (!current || current.id !== session.id) return;
    current = session;
    renderHeader(session);
    renderMap();
  }

  function close() {
    if (!current) return;
    const id = current.id;
    current = null;
    reset();
    root.hidden = true;
    options.onChange?.(null);
    options.onClosed(id);
  }

  back.addEventListener("click", close, { signal: listeners.signal });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && current) close();
    },
    { signal: listeners.signal },
  );

  function dispose() {
    reset();
    listeners.abort();
    chatButton.dispose();
    root.remove();
  }

  return { openFocus, update, close, onActivity, isOpen: () => current !== null, focusedId: () => current?.id ?? null, dispose };
}
