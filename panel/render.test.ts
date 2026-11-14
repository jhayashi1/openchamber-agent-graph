import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, expect, jest, mock, spyOn, test } from "bun:test";
import { LABEL_MIN_SCALE } from "./camera";
import { nodeColor } from "./color";
import { recencyOpacity, type AgentGraph } from "./graph";
import { DEFAULT_SETTINGS, type AgentGraphSettings } from "./settings";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
const { createGraphView } = await import("./render");

class StubResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
globalThis.ResizeObserver = StubResizeObserver;
Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 360 });
Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 480 });

function makeGraph(ids: string[]): AgentGraph {
  return {
    rootId: ids[0]!,
    nodes: ids.map((id, index) => ({
      id,
      label: "build",
      title: `Session ${id}`,
      agent: "build",
      activity: id === "b" ? "running" : "idle",
      outcome: null,
      depth: index === 0 ? 0 : 1,
      isCurrent: id === "b",
      isRoot: index === 0,
      createdAt: index,
    })),
    edges: ids.slice(1).map((id) => ({ from: ids[0]!, to: id, kind: "dispatch" as const })),
  };
}

let container: HTMLElement;
let view: ReturnType<typeof createGraphView>;
const onSelect = mock((_id: string) => {});

function positionOf(id: string) {
  const transform = container.querySelector(`[data-session-id="${id}"]`)!.getAttribute("transform")!;
  const [x, y] = transform.match(/-?[\d.]+(e-?\d+)?/g)!.map(Number);
  return { x: x!, y: y! };
}

beforeEach(() => {
  onSelect.mockClear();
  container = document.createElement("div");
  document.body.replaceChildren(container);
  view = createGraphView(container, onSelect);
  view.update(makeGraph(["a", "b", "c"]));
});

test("draws one body circle per agent and one edge per dispatch", () => {
  expect(container.querySelectorAll(".ag-body")).toHaveLength(3);
  expect(container.querySelectorAll(".ag-edge")).toHaveLength(2);
});

test("draws a backdrop under each body, no rings, and one beam per edge", () => {
  expect(container.querySelectorAll(".ag-stage circle:not(.ag-halo)")).toHaveLength(6);
  for (const id of ["a", "b", "c"]) {
    const circles = [...container.querySelectorAll(`[data-session-id="${id}"] circle`)];
    const backdrop = circles.findIndex((circle) => circle.classList.contains("ag-backdrop"));
    const body = circles.findIndex((circle) => circle.classList.contains("ag-body"));
    expect(backdrop).toBeGreaterThanOrEqual(0);
    expect(backdrop).toBeLessThan(body);
  }
  expect(container.querySelectorAll(".ag-beam")).toHaveLength(2);
});

test("labels show the title first and the agent second", () => {
  const texts = container.querySelectorAll('[data-session-id="a"] text');
  expect(texts[0]?.textContent).toBe("Session a");
  expect(texts[1]?.textContent).toBe("build");
  expect(container.querySelector('[data-session-id="a"]')?.getAttribute("aria-label")).toBe("Session a (build)");
});

test("fades circles by recency", () => {
  const opacity = (id: string) => Number(container.querySelector<SVGElement>(`[data-session-id="${id}"] .ag-body`)!.style.opacity);
  expect(opacity("c")).toBe(1);
  expect(opacity("a")).toBeCloseTo(0.35);
  expect(opacity("b")).toBeCloseTo(0.675);
});

test("recencyOpacity ranks newest to oldest", () => {
  const node = (id: string, createdAt: number) => ({ ...makeGraph(["x"]).nodes[0]!, id, createdAt });
  const result = recencyOpacity([node("old", 1), node("new", 9), node("mid", 5), node("tie", 5)]);
  expect(result.get("new")).toBe(1);
  expect(result.get("old")).toBeCloseTo(0.35);
  expect(result.get("mid")).toBe(result.get("tie"));
  expect(result.get("new")!).toBeGreaterThan(result.get("mid")!);
  expect(result.get("mid")!).toBeGreaterThan(result.get("old")!);
  expect(recencyOpacity([node("only", 3)]).get("only")).toBe(1);
});

test("shows only the counts in the header and an icon fit button", () => {
  expect(container.querySelector(".ag-header")?.textContent).toBe("3 agents1 running");
  expect(container.querySelector(".ag-header-title")).toBeNull();
  const fit = container.querySelector<HTMLButtonElement>('[aria-label="Fit graph to view"]')!;
  expect(fit.title).toBe("Fit graph to view");
  expect(fit.querySelector("svg path")).not.toBeNull();
});

test("marks only the current node", () => {
  const current = container.querySelectorAll(".ag-node.is-current");
  expect(current).toHaveLength(1);
  expect(current[0]?.getAttribute("data-session-id")).toBe("b");
});

test("fills each node with its stable colour", () => {
  for (const id of ["a", "b", "c"]) {
    const body = container.querySelector(`[data-session-id="${id}"] .ag-body`)!;
    expect(body.getAttribute("fill")).toBe(nodeColor(id));
  }
});

test("a click and Enter open the focus view instead of the chat", () => {
  const node = container.querySelector('[data-session-id="c"]')!;
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  expect(container.querySelector<HTMLElement>(".ag-focus")!.hidden).toBe(false);
  container.querySelector<HTMLButtonElement>(".ag-focus-back")!.click();
  expect(container.querySelector<HTMLElement>(".ag-focus")!.hidden).toBe(true);
  node.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(container.querySelector<HTMLElement>(".ag-focus")!.hidden).toBe(false);
  expect(onSelect).not.toHaveBeenCalled();
});

test("update keeps existing nodes near their positions when a node is added", () => {
  const before = ["a", "b", "c"].map(positionOf);
  view.update(makeGraph(["a", "b", "c", "d"]));
  expect(container.querySelectorAll(".ag-body")).toHaveLength(4);
  ["a", "b", "c"].map(positionOf).forEach((after, index) => {
    expect(Math.hypot(after.x - before[index]!.x, after.y - before[index]!.y)).toBeLessThan(30);
  });
});

test("update removes nodes that left the graph", () => {
  view.update(makeGraph(["a", "b"]));
  expect(container.querySelectorAll(".ag-body")).toHaveLength(2);
  expect(container.querySelectorAll(".ag-edge")).toHaveLength(1);
});

test("labels show only at or above the label scale", () => {
  const svg = container.querySelector(".ag-stage svg")!;
  const world = svg.querySelector("g")!;
  const scaleOf = () => Number(world.getAttribute("transform")!.match(/scale\(([\d.]+)\)/)![1]);
  expect(svg.classList.contains("ag-labels-on")).toBe(scaleOf() >= LABEL_MIN_SCALE);

  const stage = container.querySelector(".ag-stage")!;
  const zoomOut = new window.WheelEvent("wheel", { deltaY: 2000, bubbles: true, cancelable: true });
  stage.dispatchEvent(zoomOut);
  expect(scaleOf()).toBeLessThan(LABEL_MIN_SCALE);
  expect(svg.classList.contains("ag-labels-on")).toBe(false);

  const zoomIn = new window.WheelEvent("wheel", { deltaY: -4000, bubbles: true, cancelable: true });
  stage.dispatchEvent(zoomIn);
  expect(scaleOf()).toBeGreaterThanOrEqual(LABEL_MIN_SCALE);
  expect(svg.classList.contains("ag-labels-on")).toBe(true);
});

test("the fit button refits after zooming", () => {
  const world = container.querySelector(".ag-stage svg")!.querySelector("g")!;
  const before = world.getAttribute("transform");
  container.querySelector(".ag-stage")!.dispatchEvent(new window.WheelEvent("wheel", { deltaY: 2000, bubbles: true, cancelable: true }));
  expect(world.getAttribute("transform")).not.toBe(before);
  container.querySelector<HTMLButtonElement>('[aria-label="Fit graph to view"]')!.click();
  expect(world.getAttribute("transform")).toBe(before);
});

test("dispose removes the view", () => {
  view.dispose();
  expect(container.children).toHaveLength(0);
});

test("running nodes have the is-running class and halos behind the backdrop", () => {
  const running = container.querySelector('[data-session-id="b"]')!;
  expect(running.classList.contains("is-running")).toBe(true);
  const halo = running.querySelector(".ag-halo")!;
  expect(halo.getAttribute("fill")).toBe(nodeColor("b"));
  expect(halo.compareDocumentPosition(running.querySelector(".ag-backdrop")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelector('[data-session-id="a"]')?.classList.contains("is-running")).toBe(false);
});

test("update removes the running class when a node completes", () => {
  const graph = makeGraph(["a", "b", "c"]);
  view.update({ ...graph, nodes: graph.nodes.map((node) => ({ ...node, activity: "idle" as const })) });
  expect(container.querySelectorAll(".is-running")).toHaveLength(0);
});

function withActivity(id: string, activity: "idle" | "running" | "waiting-question" | "waiting-permission") {
  const graph = makeGraph(["a", "b", "c"]);
  view.update({ ...graph, nodes: graph.nodes.map((node) => (node.id === id ? { ...node, activity } : node)) });
  return container.querySelector(`[data-session-id="${id}"]`)!;
}

test("waiting nodes get is-waiting, never is-running, and a tooltip line", () => {
  const question = withActivity("a", "waiting-question");
  expect(question.classList.contains("is-waiting")).toBe(true);
  expect(question.classList.contains("is-running")).toBe(false);
  expect(question.querySelector("title")!.textContent).toContain("Waiting for your answer");
  const permission = withActivity("a", "waiting-permission");
  expect(permission.classList.contains("is-waiting")).toBe(true);
  expect(permission.classList.contains("is-running")).toBe(false);
  expect(permission.querySelector("title")!.textContent).toContain("Waiting for your permission");
});

test("update switches a node from waiting to running and idle has neither", () => {
  withActivity("a", "waiting-question");
  const running = withActivity("a", "running");
  expect(running.classList.contains("is-waiting")).toBe(false);
  expect(running.classList.contains("is-running")).toBe(true);
  const idle = withActivity("a", "idle");
  expect(idle.classList.contains("is-waiting")).toBe(false);
  expect(idle.classList.contains("is-running")).toBe(false);
  expect(idle.querySelector("title")!.textContent).not.toContain("Waiting");
});

function beamOf(index: number) {
  return container.querySelectorAll(".ag-beam")[index]!;
}

function useFreshView(random: number, overrides: Partial<AgentGraphSettings> = { autoPause: false }) {
  view.dispose();
  jest.useFakeTimers();
  const randomSpy = spyOn(Math, "random").mockReturnValue(random);
  container = document.createElement("div");
  document.body.replaceChildren(container);
  view = createGraphView(container, onSelect, { settings: { ...DEFAULT_SETTINGS, ...overrides } });
  view.update(makeGraph(["a", "b", "c"]));
  return randomSpy;
}

afterEach(() => {
  view.dispose();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("the first beam waits at least 2 s instead of starting at once", () => {
  useFreshView(0);
  jest.advanceTimersByTime(1999);
  expect(container.querySelectorAll(".is-travelling")).toHaveLength(0);
  jest.advanceTimersByTime(1);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
});

test("the first beam waits at most the pause maximum", () => {
  useFreshView(1);
  jest.advanceTimersByTime(9999);
  expect(container.querySelectorAll(".is-travelling")).toHaveLength(0);
  jest.advanceTimersByTime(1);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
});

test("the first beam waits the pause maximum when it is below 2 s", () => {
  useFreshView(0, { autoPause: false, beamPauseMin: 0.5, beamPauseMax: 1 });
  jest.advanceTimersByTime(999);
  expect(container.querySelectorAll(".is-travelling")).toHaveLength(0);
  jest.advanceTimersByTime(1);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
});

test("a beam travels for 2 s, rests the random pause, then travels again", () => {
  useFreshView(0);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(false);
  jest.advanceTimersByTime(2000);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
  jest.advanceTimersByTime(2500);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(false);
  jest.advanceTimersByTime(4999);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(false);
  jest.advanceTimersByTime(1);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
});

test("the pause is drawn again each pass", () => {
  const randomSpy = useFreshView(0.9);
  jest.advanceTimersByTime(9200);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
  jest.advanceTimersByTime(2500);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(false);
  jest.advanceTimersByTime(9499);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(false);
  jest.advanceTimersByTime(1);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
  randomSpy.mockReturnValue(0);
  jest.advanceTimersByTime(2500);
  jest.advanceTimersByTime(5000);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
});

test("removed edges and dispose cancel their pending beam timers", () => {
  useFreshView(0.5);
  jest.advanceTimersByTime(500);
  const removedBeams = [...container.querySelectorAll(".ag-beam")];
  view.update(makeGraph(["a"]));
  jest.advanceTimersByTime(10000);
  expect(jest.getTimerCount()).toBe(0);
  expect(removedBeams.every((beam) => beam.classList.contains("is-travelling") === false)).toBe(true);

  view.update(makeGraph(["a", "b", "c"]));
  const disposedBeams = [...container.querySelectorAll(".ag-beam")];
  view.dispose();
  jest.advanceTimersByTime(10000);
  expect(jest.getTimerCount()).toBe(0);
  expect(disposedBeams.every((beam) => beam.classList.contains("is-travelling") === false)).toBe(true);
});

test("reduced motion starts no beam loops", () => {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({ matches: true, media: query })) as typeof window.matchMedia;
  try {
    useFreshView(0);
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(10000);
    expect(container.querySelectorAll(".is-travelling")).toHaveLength(0);
  } finally {
    window.matchMedia = original;
  }
});

test("auto pause scales with the node count and follows graph changes", () => {
  useFreshView(0, {});
  jest.advanceTimersByTime(1999);
  expect(container.querySelectorAll(".is-travelling")).toHaveLength(0);
  jest.advanceTimersByTime(1);
  expect(container.querySelectorAll(".is-travelling")).toHaveLength(2);
  view.update(makeGraph(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"]));
  const added = beamOf(9);
  jest.advanceTimersByTime(1999);
  expect(added.classList.contains("is-travelling")).toBe(false);
  jest.advanceTimersByTime(1);
  expect(added.classList.contains("is-travelling")).toBe(true);
});

test("auto pause off uses the pause sliders", () => {
  useFreshView(0, { autoPause: false, beamPauseMin: 7, beamPauseMax: 9 });
  jest.advanceTimersByTime(2000);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
  jest.advanceTimersByTime(2500);
  jest.advanceTimersByTime(6999);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(false);
  jest.advanceTimersByTime(1);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
});

test("Show beams off clears timers and travelling beams, on restarts with a pause", () => {
  useFreshView(0);
  jest.advanceTimersByTime(2000);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
  const root = container.querySelector<HTMLElement>(".ag-root")!;
  view.setSettings({ ...DEFAULT_SETTINGS, autoPause: false, beamsOn: false });
  expect(jest.getTimerCount()).toBe(0);
  expect(container.querySelectorAll(".is-travelling")).toHaveLength(0);
  expect(root.classList.contains("ag-no-beams")).toBe(true);
  jest.advanceTimersByTime(20000);
  expect(container.querySelectorAll(".is-travelling")).toHaveLength(0);
  view.setSettings({ ...DEFAULT_SETTINGS, autoPause: false });
  expect(root.classList.contains("ag-no-beams")).toBe(false);
  expect(container.querySelectorAll(".is-travelling")).toHaveLength(0);
  jest.advanceTimersByTime(1999);
  expect(container.querySelectorAll(".is-travelling")).toHaveLength(0);
  jest.advanceTimersByTime(1);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
});

test("the beam switches in the popover apply live, save, and disable the pause sliders", async () => {
  const saved: AgentGraphSettings[] = [];
  view.dispose();
  view = createGraphView(container, onSelect, { onSettingsSave: (next) => saved.push(next) });
  view.update(makeGraph(["a", "b", "c"]));
  const root = container.querySelector<HTMLElement>(".ag-root")!;
  const switches = () => [...container.querySelectorAll<HTMLElement>(".ag-popover [role=switch]")];
  const byLabel = (text: string) => switches().find((control) => control.closest(".oc-sdk-check")?.textContent?.includes(text))!;
  const pauseSliders = () => [...container.querySelectorAll<HTMLInputElement>(".ag-popover input[type=range]")].filter((input) => input.max === "30");
  expect(pauseSliders().every((input) => input.disabled)).toBe(true);
  expect(container.textContent).toContain("auto 3 s");
  byLabel("Auto pause").click();
  expect(pauseSliders().every((input) => !input.disabled)).toBe(true);
  byLabel("Show beams").click();
  expect(root.classList.contains("ag-no-beams")).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(saved.at(-1)).toMatchObject({ beamsOn: false, autoPause: false });
});

function edgeElements() {
  return [...container.querySelectorAll(".ag-edge, .ag-beam")];
}

test("adding a node keeps existing node groups attached and untouched", () => {
    const groups = [...container.querySelectorAll(".ag-node")];
  const nodeLayer = groups[0]!.parentElement!;
  const mutations: MutationRecord[] = [];
  const observer = new MutationObserver((records) => mutations.push(...records));
  observer.observe(nodeLayer, { childList: true });
  view.update(makeGraph(["a", "b", "c", "d"]));
  observer.takeRecords().forEach((record) => mutations.push(record));
  const after = [...container.querySelectorAll(".ag-node")];
  expect(after.slice(0, 3).every((group, index) => group === groups[index] && group.isConnected)).toBe(true);
  expect(after).toHaveLength(4);
  expect(mutations.flatMap((record) => [...record.removedNodes])).toHaveLength(0);
});

test("adding a node keeps existing edge lines and beams", () => {
    const before = edgeElements();
  view.update(makeGraph(["a", "b", "c", "d"]));
  const after = edgeElements();
  expect(before.every((element) => after.includes(element) && element.isConnected)).toBe(true);
  expect(after).toHaveLength(before.length + 2);
});

test("a beam that is travelling keeps its schedule across an update", () => {
  useFreshView(0);
  jest.advanceTimersByTime(2000);
  jest.advanceTimersByTime(1000);
  const beam = beamOf(0);
  expect(beam.classList.contains("is-travelling")).toBe(true);
  view.update(makeGraph(["a", "b", "c", "d"]));
  expect(beamOf(0)).toBe(beam);
  expect(beam.classList.contains("is-travelling")).toBe(true);
  jest.advanceTimersByTime(1499);
  expect(beam.classList.contains("is-travelling")).toBe(true);
  jest.advanceTimersByTime(1);
  expect(beam.classList.contains("is-travelling")).toBe(false);
});

test("the timer fallback never ends a pass before the travel time", () => {
  useFreshView(0);
  jest.advanceTimersByTime(2000);
  jest.advanceTimersByTime(2000);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
});

test("animationend ends the pass and starts the pause from that moment", () => {
  useFreshView(0);
  jest.advanceTimersByTime(2000);
  jest.advanceTimersByTime(1800);
  beamOf(0).dispatchEvent(new Event("animationend"));
  expect(beamOf(0).classList.contains("is-travelling")).toBe(false);
  jest.advanceTimersByTime(4999);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(false);
  jest.advanceTimersByTime(1);
  expect(beamOf(0).classList.contains("is-travelling")).toBe(true);
});

test("a new edge gets its own beam loop", () => {
  useFreshView(0.5);
  view.update(makeGraph(["a", "b", "c", "d"]));
  const newBeam = beamOf(2);
  expect(newBeam.classList.contains("is-travelling")).toBe(false);
  jest.advanceTimersByTime(5999);
  expect(newBeam.classList.contains("is-travelling")).toBe(false);
  jest.advanceTimersByTime(1);
  expect(newBeam.classList.contains("is-travelling")).toBe(true);
});

test("a removed edge clears its timer and its elements", () => {
  useFreshView(0.5);
  const removed = [beamOf(1), container.querySelectorAll(".ag-edge")[1]!];
  const timersBefore = jest.getTimerCount();
  view.update(makeGraph(["a", "b"]));
  expect(jest.getTimerCount()).toBe(timersBefore - 1);
  expect(removed.every((element) => !element.isConnected)).toBe(true);
  expect(container.querySelectorAll(".ag-beam")).toHaveLength(1);
});

test("a running node keeps its class and pulse delay across an update", () => {
  const group = container.querySelector('[data-session-id="b"]') as SVGGElement;
  const delay = group.style.getPropertyValue("--pulse-delay");
  view.update(makeGraph(["a", "b", "c", "d"]));
  expect(container.querySelector('[data-session-id="b"]')).toBe(group);
  expect(group.classList.contains("is-running")).toBe(true);
  expect(group.style.getPropertyValue("--pulse-delay")).toBe(delay);
});

function withMessage(count: number, lastAt = Date.now()): AgentGraph {
  const graph = makeGraph(["a", "b", "c"]);
  return { ...graph, edges: [...graph.edges, { from: "b", to: "a", kind: "message", count, lastAt }] };
}

const messageEdge = () => container.querySelector(".ag-message-edge");

test("draws a message edge as a dashed path next to a dispatch edge for the same pair", () => {
  view.update(withMessage(2));
  const path = messageEdge()!;
  expect(path.tagName.toLowerCase()).toBe("path");
  expect(path.getAttribute("d")).toMatch(/^M .* Q .*/);
  expect(container.querySelectorAll("line.ag-edge")).toHaveLength(2);
  expect(container.querySelectorAll(".ag-beam")).toHaveLength(3);
  expect(container.querySelectorAll(".ag-message-beam")).toHaveLength(1);
});

test("a message edge and its tooltip are kept across updates and the count updates in place", () => {
  view.update(withMessage(2));
  const path = messageEdge();
  const hit = container.querySelector(".ag-message-hit")!;
  const title = hit.querySelector("title")!;
  expect(title.textContent).toBe("Session b -> Session a: 2 messages, last just now");
  view.update(withMessage(1));
  expect(messageEdge()).toBe(path);
  expect(container.querySelector(".ag-message-hit")).toBe(hit);
  expect(hit.querySelector("title")).toBe(title);
  expect(title.textContent).toBe("Session b -> Session a: 1 message, last just now");
});

test("a message edge is removed with its timer when it disappears", () => {
  useFreshView(0.5);
  view.update(withMessage(2));
  const timersWith = jest.getTimerCount();
  const path = messageEdge()!;
  view.update(makeGraph(["a", "b", "c"]));
  expect(jest.getTimerCount()).toBe(timersWith - 1);
  expect(path.isConnected).toBe(false);
  expect(container.querySelector(".ag-message-hit")).toBeNull();
  expect(container.querySelectorAll(".ag-beam")).toHaveLength(2);
});

test("the header shows messages off with the reason", () => {
  const note = container.querySelector<HTMLElement>(".ag-header-note")!;
  expect(note.hidden).toBe(true);
  view.setMessagesOff("Approve it");
  expect(note.hidden).toBe(false);
  expect(note.textContent).toBe("messages off");
  expect(note.title).toBe("Approve it");
  view.setMessagesOff(null);
  expect(note.hidden).toBe(true);
});

test("setSettings changes custom properties and classes without removing elements", () => {
  view.update(makeGraph(["a", "b", "c"]));
  const beams = [...container.querySelectorAll(".ag-beam")];
  const bodies = [...container.querySelectorAll(".ag-body")];
  view.setSettings({ ...DEFAULT_SETTINGS, beamColor: "#ff0000", beamLength: 60, messageOpacity: 50, beamGlow: false, pulseRunning: false, recencyFade: false });
  const root = container.querySelector<HTMLElement>(".ag-root")!;
  expect(root.style.getPropertyValue("--ag-beam-stroke")).toBe("#ff0000");
  expect(root.style.getPropertyValue("--ag-beam-dash")).toBe("60px");
  expect(root.style.getPropertyValue("--ag-message-opacity")).toBe("0.5");
  expect(root.classList.contains("ag-no-glow")).toBe(true);
  expect(root.classList.contains("ag-no-pulse")).toBe(true);
  expect([...container.querySelectorAll(".ag-beam")]).toEqual(beams);
  expect([...container.querySelectorAll(".ag-body")]).toEqual(bodies);
  for (const body of bodies) expect((body as SVGElement).style.opacity).toBe("1");
});

test("settings popover opens, closes on Escape and outside click, and restores focus", () => {
  const button = container.querySelector<HTMLButtonElement>(".ag-settings-button")!;
  const panel = container.querySelector<HTMLElement>(".ag-popover")!;
  expect(panel.hidden).toBe(true);
  button.click();
  expect(panel.hidden).toBe(false);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(panel.hidden).toBe(true);
  expect(document.activeElement).toBe(button);
  button.click();
  document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  expect(panel.hidden).toBe(true);
  button.click();
  button.click();
  expect(panel.hidden).toBe(true);
});

test("slider applies live, saves debounced, and reset restores defaults", async () => {
  const saved: AgentGraphSettings[] = [];
  view.dispose();
  view = createGraphView(container, onSelect, { onSettingsSave: (next) => saved.push(next) });
  const root = container.querySelector<HTMLElement>(".ag-root")!;
  const slider = container.querySelector<HTMLInputElement>('.ag-popover input[type="range"]')!;
  slider.value = "60";
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  slider.value = "70";
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  expect(root.style.getPropertyValue("--ag-beam-dash")).toBe("70px");
  expect(saved).toHaveLength(0);
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(saved).toHaveLength(1);
  expect(saved[0]?.beamLength).toBe(70);
  container.querySelector<HTMLButtonElement>(".ag-reset button")!.click();
  expect(root.style.getPropertyValue("--ag-beam-dash")).toBe("24px");
  expect(slider.value).toBe("24");
});

test("Physics sliders apply live and reuse elements across simulation updates", () => {
  view.update(makeGraph(["a", "b", "c"]));
  const nodes = [...container.querySelectorAll(".ag-node")];
  const before = nodes.map((node) => node.getAttribute("transform"));
  const slider = [...container.querySelectorAll<HTMLInputElement>(".ag-setting input[type=range]")].find(
    (input) => input.max === "400",
  )!;
  slider.value = "300";
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  expect([...container.querySelectorAll(".ag-node")]).toEqual(nodes);
  expect(before.every((value) => value !== null)).toBe(true);
});

test("Hub pull slider applies live and moves a hub toward the centre", () => {
  view.update(makeGraph(["a", "b", "c"]));
  const slider = [...container.querySelectorAll<HTMLInputElement>(".ag-setting input[type=range]")].find((input) => input.max === "3")!;
  expect(slider.value).toBe(String(DEFAULT_SETTINGS.hubPull));
  const nodes = [...container.querySelectorAll(".ag-node")];
  slider.value = "2";
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  expect([...container.querySelectorAll(".ag-node")]).toEqual(nodes);
  expect(slider.value).toBe("2");
});

function pointer(type: string, x: number, y: number, target: Element, id = 1) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: id });
  target.dispatchEvent(event);
}

function dragSetup() {
  view.dispose();
  globalThis.matchMedia = (() => ({ matches: true })) as unknown as typeof matchMedia;
  container = document.createElement("div");
  document.body.replaceChildren(container);
  view = createGraphView(container, onSelect);
  view.update(makeGraph(["a", "b", "c"]));
  const stage = container.querySelector(".ag-stage")!;
  (stage as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
  return { stage, node: container.querySelector('[data-session-id="b"]')! };
}

test("dragging a node moves it under the pointer, sets the grabbing class and does not select", () => {
  const { stage, node } = dragSetup();
  const start = positionOf("b");
  pointer("pointerdown", 100, 100, node);
  pointer("pointermove", 160, 100, stage);
  pointer("pointermove", 200, 130, stage);
  expect(stage.classList.contains("ag-dragging")).toBe(true);
  const moved = positionOf("b");
  expect(moved.x - start.x).toBeGreaterThan(20);
  expect((moved.y - start.y) / (moved.x - start.x)).toBeCloseTo(0.3, 1);
  pointer("pointerup", 200, 130, stage);
  node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onSelect).not.toHaveBeenCalled();
  expect(stage.classList.contains("ag-dragging")).toBe(false);
});

test("pointercancel ends the drag and the node stays where it was dropped", () => {
  const { stage, node } = dragSetup();
  pointer("pointerdown", 100, 100, node);
  pointer("pointermove", 300, 100, stage);
  const pinned = positionOf("b");
  pointer("pointercancel", 300, 100, stage);
  expect(stage.classList.contains("ag-dragging")).toBe(false);
  expect(positionOf("b").x).toBeCloseTo(pinned.x, 5);
});

test("a dropped node and the camera survive an update that adds a node", () => {
  const { stage, node } = dragSetup();
  pointer("pointerdown", 100, 100, node);
  pointer("pointermove", 300, 100, stage);
  pointer("pointerup", 300, 100, stage);
  const dropped = positionOf("b");
  const world = container.querySelector(".ag-stage svg")!.querySelector("g")!;
  const transform = world.getAttribute("transform");
  view.update(makeGraph(["a", "b", "c", "d"]));
  expect(positionOf("b")).toEqual(dropped);
  expect(world.getAttribute("transform")).toBe(transform);
});

test("an update with the same graph moves no node and keeps the camera", () => {
  const world = container.querySelector(".ag-stage svg")!.querySelector("g")!;
  const transform = world.getAttribute("transform");
  const before = ["a", "b", "c"].map(positionOf);
  view.update(makeGraph(["a", "b", "c"]));
  expect(["a", "b", "c"].map(positionOf)).toEqual(before);
  expect(world.getAttribute("transform")).toBe(transform);
});

test("a click without drag opens the focus view for the session", () => {
  const { stage, node } = dragSetup();
  pointer("pointerdown", 100, 100, node);
  pointer("pointerup", 100, 100, stage);
  node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(container.querySelector<HTMLElement>(".ag-focus")!.hidden).toBe(false);
  expect(container.querySelector(".ag-focus-title")!.textContent).toBe("Session b");
  expect(onSelect).not.toHaveBeenCalled();
});

test("setSettings recolours the same circles in place", () => {
  view.update(makeGraph(["a", "b", "c"]));
  const body = container.querySelector('[data-session-id="a"] .ag-body')!;
  const halo = container.querySelector('[data-session-id="a"] .ag-halo')!;
  view.setSettings({ ...DEFAULT_SETTINGS, nodePalette: "neon" });
  expect(container.querySelector('[data-session-id="a"] .ag-body')).toBe(body);
  expect(body.getAttribute("fill")).toBe(nodeColor("a", "neon"));
  expect(halo.getAttribute("fill")).toBe(nodeColor("a", "neon"));
});

test("the palette control changes node colours live and saves debounced", async () => {
  const saved: AgentGraphSettings[] = [];
  view.dispose();
  view = createGraphView(container, onSelect, { onSettingsSave: (next) => saved.push(next) });
  view.update(makeGraph(["a", "b", "c"]));
  container.querySelector<HTMLButtonElement>("#ag-section-nodes .oc-sdk-select button, #ag-section-nodes [role=combobox], #ag-section-nodes button")!.click();
  const option = [...document.querySelectorAll<HTMLElement>("[role=option]")].find((item) => item.textContent?.includes("Pastel"))!;
  option.click();
  expect(container.querySelector('[data-session-id="a"] .ag-body')!.getAttribute("fill")).toBe(nodeColor("a", "pastel"));
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(saved.at(-1)?.nodePalette).toBe("pastel");
});

test("settings sections are collapsed by default and toggle independently", () => {
  const headers = [...container.querySelectorAll<HTMLButtonElement>(".ag-section-header")];
  expect(headers.map((header) => header.textContent)).toEqual(["Nodes", "Beams", "Subagent edges", "Physics"]);
  expect(headers.every((header) => header.getAttribute("aria-expanded") === "false")).toBe(true);
  const [nodes, beams] = headers as [HTMLButtonElement, HTMLButtonElement];
  const region = (header: HTMLButtonElement) => container.querySelector<HTMLElement>(`#${header.getAttribute("aria-controls")}`)!;
  expect(region(beams).dataset.open).toBe("false");
  beams.click();
  nodes.click();
  expect(beams.getAttribute("aria-expanded")).toBe("true");
  expect(nodes.getAttribute("aria-expanded")).toBe("true");
  expect(region(beams).dataset.open).toBe("true");
  expect(region(beams).getAttribute("aria-labelledby")).toBe(beams.id);
  beams.click();
  expect(beams.getAttribute("aria-expanded")).toBe("false");
  expect(nodes.getAttribute("aria-expanded")).toBe("true");
});

test("open sections are reported, restored, and untouched by reset", () => {
  const reported: string[][] = [];
  view.dispose();
  view = createGraphView(container, onSelect, { sections: ["forces"], onSectionsSave: (ids) => reported.push(ids) });
  const expanded = () => [...container.querySelectorAll<HTMLButtonElement>(".ag-section-header")].filter((h) => h.getAttribute("aria-expanded") === "true").map((h) => h.textContent);
  expect(expanded()).toEqual(["Physics"]);
  container.querySelector<HTMLButtonElement>("#ag-section-beams-header")!.click();
  expect(reported).toEqual([["forces", "beams"]]);
  container.querySelector<HTMLButtonElement>(".ag-reset button")!.click();
  expect(expanded()).toEqual(["Beams", "Physics"]);
  expect(reported).toHaveLength(1);
  view.setSections(["nodes"]);
  expect(expanded()).toEqual(["Nodes"]);
});

test("controls in collapsed sections still apply live", () => {
  view.dispose();
  view = createGraphView(container, onSelect, { settings: { ...DEFAULT_SETTINGS, autoPause: true } });
  view.update(makeGraph(["a", "b", "c"]));
  expect(container.querySelector('#ag-section-beams[data-open="false"]')!.textContent).toContain("auto");
  const slider = container.querySelector<HTMLInputElement>('#ag-section-forces input[type="range"]')!;
  slider.value = "0.5";
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  expect(container.querySelector('#ag-section-forces[data-open="false"]')).not.toBeNull();
});

function motionView(reduced: boolean) {
  const original = globalThis.matchMedia;
  globalThis.matchMedia = (() => ({ matches: reduced })) as unknown as typeof matchMedia;
  window.matchMedia = globalThis.matchMedia;
  const fresh = createGraphView(container, onSelect);
  globalThis.matchMedia = original;
  window.matchMedia = original;
  fresh.update(makeGraph(["a", "b", "c"]));
  return fresh;
}

test("reduced motion shows a still icon next to the node instead of a flying one", () => {
  const still = motionView(true);
  still.pulse([{ sessionId: "a", callId: "1", kind: "files", phase: "start" }]);
  const icon = container.querySelector(".ag-tool-pulse")!;
  expect(icon.classList.contains("is-still")).toBe(true);
  expect(icon.querySelector('[data-icon="files"] path')).not.toBeNull();
  expect(icon.querySelector("circle")).toBeNull();
});

test("tool pulses are added and removed without recreating nodes", () => {
  view = motionView(false);
  const nodes = [...container.querySelectorAll(".ag-node")];
  view.pulse([
    { sessionId: "a", callId: "1", kind: "files", phase: "start" },
    { sessionId: "a", callId: "2", kind: "shell", phase: "error" },
    { sessionId: "zzz", callId: "3", kind: "files", phase: "start" },
  ]);
  const pulses = container.querySelectorAll(".ag-tool-pulse");
  expect(pulses).toHaveLength(2);
  expect((pulses[1] as SVGElement).style.color).toBe("#ef4444");
  expect((pulses[0] as SVGElement).style.color).toBe("");
  expect(pulses[0]!.querySelector('[data-icon="files"]')).not.toBeNull();
  expect(pulses[1]!.querySelector('[data-icon="shell"]')).not.toBeNull();
  expect(pulses[0]!.querySelector("circle")).toBeNull();
  expect(container.querySelector('[data-session-id="a"] .ag-tool-flash')).not.toBeNull();
  jest.useFakeTimers();
  view.pulse([{ sessionId: "b", callId: "4", kind: "network", phase: "end" }]);
  jest.advanceTimersByTime(1000);
  jest.useRealTimers();
  expect(container.querySelector('[data-session-id="b"] .ag-tool-pulse')).toBeNull();
  expect([...container.querySelectorAll(".ag-node")]).toEqual(nodes);
});

test("many calls on one node show three dots and a count", () => {
  view = motionView(false);
  view.pulse(Array.from({ length: 5 }, (_, i) => ({ sessionId: "a", callId: `${i}`, kind: "files" as const, phase: "start" as const })));
  expect(container.querySelectorAll('[data-session-id="a"] .ag-tool-pulse')).toHaveLength(3);
  expect(container.querySelector(".ag-tool-count")!.textContent).toBe("x5");
});

test("the kind legend lists an icon and a name per kind", () => {
  const items = [...container.querySelectorAll(".ag-legend-kind")];
  expect(items.map((item) => item.textContent)).toEqual(["files", "shell", "network", "mcp", "browser", "agents", "skills", "memory", "user"]);
  for (const item of items) expect(item.querySelector("svg path")).not.toBeNull();
  expect(container.querySelector(".ag-legend-kinds .ag-legend-dot")).toBeNull();
});

test("tool pulses off hides the kind legend and ignores pulses", () => {
  const legend = container.querySelector<HTMLElement>(".ag-legend-kinds")!;
  expect(legend.hidden).toBe(false);
  view.setSettings({ ...DEFAULT_SETTINGS, toolPulses: false });
  expect(legend.hidden).toBe(true);
  view.pulse([{ sessionId: "a", callId: "1", kind: "files", phase: "start" }]);
  expect(container.querySelectorAll(".ag-tool-pulse")).toHaveLength(0);
});
