import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { createActivityPoller, focusPollerState, type ActivityCall, type ActivityKind } from "./activity";
import type { AgentGraph } from "./graph";

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

const graph: AgentGraph = {
  rootId: "a",
  nodes: ["a", "b", "c"].map((id, index) => ({
    id,
    label: "build",
    title: `Session ${id}`,
    agent: "build",
    activity: "idle" as const,
    outcome: null,
    depth: index === 0 ? 0 : 1,
    isCurrent: id === "a",
    isRoot: index === 0,
    createdAt: index,
  })),
  edges: [
    { from: "a", to: "b", kind: "dispatch" },
    { from: "a", to: "c", kind: "dispatch" },
  ],
};

let container: HTMLElement;
let view: ReturnType<typeof createGraphView>;
const onSelect = mock((_id: string) => {});
const onFocusChange = mock((_id: string | null) => {});

let counter = 0;
function call(kind: ActivityKind, status: ActivityCall["status"], ago = 1000, sessionId = "a"): ActivityCall {
  const startedAt = Date.now() - ago;
  return { sessionId, callId: `c${counter++}`, tool: `tool-${kind}`, kind, status, startedAt, ...(status === "running" ? {} : { endedAt: startedAt + 10 }) };
}

const focusRoot = () => container.querySelector<HTMLElement>(".ag-focus")!;
const station = (kind: string) => container.querySelector(`.ag-f-station[data-kind="${kind}"]`)!;
const spoke = (kind: string) => container.querySelector(`.ag-f-spoke[data-kind="${kind}"]`)!;
const openNode = (id: string) => container.querySelector(`[data-session-id="${id}"]`)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

beforeEach(() => {
  counter = 0;
  onSelect.mockClear();
  onFocusChange.mockClear();
  container = document.createElement("div");
  document.body.replaceChildren(container);
  view = createGraphView(container, onSelect, { onFocusChange });
  view.update(graph);
});

afterEach(() => view.dispose());

test("the focus view header shows the title, agent type, status and an Open chat button", () => {
  openNode("b");
  expect(focusRoot().hidden).toBe(false);
  expect(container.querySelector(".ag-focus-title")!.textContent).toBe("Session b");
  expect(container.querySelector(".ag-focus-sub")!.textContent).toBe("build - idle");
  expect(container.querySelector('.ag-focus-back')!.getAttribute("aria-label")).toBe("Back to graph");
  expect(onFocusChange).toHaveBeenLastCalledWith("b");
  expect(onSelect).not.toHaveBeenCalled();
});

test("Open chat calls the select callback with the focused session", () => {
  openNode("b");
  const button = [...focusRoot().querySelectorAll("button")].find((entry) => entry.textContent?.includes("Open chat"))!;
  button.click();
  expect(onSelect).toHaveBeenCalledWith("b");
});

test("Escape and the back button return to the graph and keep the same node elements", () => {
  const nodes = [...container.querySelectorAll(".ag-node")];
  const transforms = nodes.map((node) => node.getAttribute("transform"));
  openNode("b");
  expect(container.querySelector(".ag-root")!.classList.contains("ag-focused")).toBe(true);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(focusRoot().hidden).toBe(true);
  expect(container.querySelector(".ag-root")!.classList.contains("ag-focused")).toBe(false);
  expect(onFocusChange).toHaveBeenLastCalledWith(null);
  expect([...container.querySelectorAll(".ag-node")]).toEqual(nodes);
  expect(nodes.map((node) => node.getAttribute("transform"))).toEqual(transforms);
  expect(document.activeElement).toBe(container.querySelector('[data-session-id="b"]'));
  openNode("c");
  container.querySelector<HTMLButtonElement>(".ag-focus-back")!.click();
  expect(focusRoot().hidden).toBe(true);
  expect([...container.querySelectorAll(".ag-node")]).toEqual(nodes);
});

test("history fills the spokes and the feed without pulses", () => {
  openNode("b");
  view.focusActivity([call("files", "completed", 5000, "b"), call("files", "completed", 4000, "b"), call("shell", "completed", 3000, "b"), call("files", "completed", 100, "a")]);
  expect(spoke("files").getAttribute("data-calls")).toBe("2");
  expect(spoke("shell").getAttribute("data-calls")).toBe("1");
  expect(spoke("network").getAttribute("data-calls")).toBe("0");
  expect(spoke("files").getAttribute("stroke-width")).toBe(spoke("network").getAttribute("stroke-width"));
  expect(Number(spoke("files").getAttribute("stroke-width"))).toBe(1);
  expect(Number(spoke("files").getAttribute("stroke-opacity"))).toBeGreaterThan(Number(spoke("network").getAttribute("stroke-opacity")));
  expect(Number(spoke("files").getAttribute("stroke-opacity"))).toBeGreaterThan(Number(spoke("network").getAttribute("stroke-opacity")));
  expect(container.querySelectorAll(".ag-feed-row")).toHaveLength(2);
  expect(container.querySelectorAll(".ag-f-pulse")).toHaveLength(0);
});

test("stations and feed rows show the kind icon; travelling markers are icons", () => {
  openNode("b");
  view.focusActivity([]);
  view.focusActivity([call("shell", "completed", 3000, "b")]);
  for (const kind of ["files", "shell", "user", "other"] as const) expect(station(kind).querySelector(`[data-icon="${kind}"]`)).not.toBeNull();
  expect(container.querySelector('.ag-feed-row[data-kind="shell"] svg[data-icon="shell"]')).not.toBeNull();
  expect(container.querySelector(".ag-feed-dot")).toBeNull();
  view.focusActivity([call("files", "running", 10, "b")]);
  const marker = container.querySelector('.ag-f-pulse[data-kind="files"]')!;
  expect(marker.querySelector('[data-icon="files"]')).not.toBeNull();
  expect(marker.querySelector("circle")).toBeNull();
});

test("a running call shows a pulse and the count of simultaneous calls; an error shows a red dot with its count", () => {
  openNode("b");
  view.focusActivity([]);
  const first = call("shell", "running", 100, "b");
  const second = call("shell", "running", 50, "b");
  view.focusActivity([first, second]);
  expect(station("shell").querySelector(".ag-f-running")!.textContent).toBe("x2");
  expect(container.querySelectorAll('.ag-f-pulse[data-phase="start"]')).toHaveLength(2);
  view.focusActivity([{ ...first, status: "error", endedAt: Date.now() }, { ...second, status: "completed", endedAt: Date.now() }]);
  expect(station("shell").querySelector(".ag-f-running")!.textContent).toBe("");
  expect(container.querySelectorAll('.ag-f-pulse[data-phase="error"]')).toHaveLength(1);
  expect(station("shell").querySelector(".ag-f-error")!.getAttribute("display")).toBe("inline");
  expect(station("shell").querySelector(".ag-f-error-count")!.textContent).toBe("1");
  expect(station("files").querySelector(".ag-f-error")!.getAttribute("display")).toBe("none");
});

test("a running call marks its station as working from the start, with no clock element", () => {
  openNode("b");
  const running = call("network", "running", 0, "b");
  view.focusActivity([running, call("files", "completed", 1000, "b")]);
  expect(container.querySelector(".ag-f-clock")).toBeNull();
  expect(station("network").classList.contains("is-busy")).toBe(true);
  expect(station("network").querySelector(".ag-f-working")).not.toBeNull();
  expect(station("files").classList.contains("is-busy")).toBe(false);
  view.focusActivity([{ ...running, status: "completed", endedAt: Date.now() }]);
  expect(station("network").classList.contains("is-busy")).toBe(false);
});

test("the working outline has no animation under reduced motion", () => {
  const css = document.getElementById("ag-focus-style")!.textContent!;
  const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
  expect(reduced).toContain(".ag-f-station.is-busy .ag-f-working");
  expect(reduced).toContain("animation: none");
});

test("consecutive calls at one station fold into one row with +N, capped at 16 rows", () => {
  openNode("b");
  view.focusActivity([
    call("shell", "completed", 5000, "b"),
    call("shell", "completed", 4000, "b"),
    call("shell", "completed", 3000, "b"),
    call("files", "completed", 2000, "b"),
  ]);
  const rows = [...container.querySelectorAll(".ag-feed-row")];
  expect(rows.map((row) => row.getAttribute("data-kind"))).toEqual(["files", "shell"]);
  expect(rows[1]!.querySelector(".ag-feed-more")!.textContent).toBe("+2");
  expect(rows[0]!.querySelector(".ag-feed-more")).toBeNull();
  const many = Array.from({ length: 40 }, (_, i) => call(i % 2 ? "files" : "shell", "completed", 100_000 - i * 1000, "b"));
  view.focusActivity(many);
  expect(container.querySelectorAll(".ag-feed-row")).toHaveLength(16);
});

test("ten stations in order, with an mcp station and icon, and no child dots", () => {
  openNode("a");
  const kinds = [...container.querySelectorAll(".ag-f-station")].map((el) => el.getAttribute("data-kind"));
  expect(kinds).toEqual(["user", "files", "shell", "network", "mcp", "browser", "agents", "skills", "memory", "other"]);
  expect(station("mcp").querySelector('[data-icon="mcp"]')).not.toBeNull();
  expect(container.querySelectorAll(".ag-f-child, .ag-f-orbit")).toHaveLength(0);
});

test("the legend lists mcp", () => {
  expect([...container.querySelectorAll(".ag-legend-kind")].map((el) => el.textContent)).toContain("mcp");
});

test("the agents station works while a subagent runs and stops when none run", () => {
  openNode("a");
  expect(station("agents").classList.contains("is-busy")).toBe(false);
  const withChild = (running: boolean) => ({ ...graph, nodes: graph.nodes.map((n) => (n.id === "b" ? { ...n, activity: running ? ("running" as const) : ("idle" as const) } : n)) });
  view.update(withChild(true));
  expect(station("agents").classList.contains("is-busy")).toBe(true);
  expect(station("agents").querySelector(".ag-f-working")).not.toBeNull();
  expect(station("agents").querySelector(".ag-f-running")!.textContent).toBe("");
  view.update(withChild(false));
  expect(station("agents").classList.contains("is-busy")).toBe(false);
});

test("the focus poller polls the focused session while open, even when idle, and stops after close", async () => {
  const request = mock(async (_ids: readonly string[], _since: number) => [] as ActivityCall[]);
  const ticks: Array<() => void> = [];
  let stops = 0;
  const poller = createActivityPoller({
    request,
    emit: () => {},
    schedule: (run) => {
      ticks.push(run);
      return () => {
        stops += 1;
      };
    },
  });
  poller.update(focusPollerState("b", true));
  await poller.tick();
  expect(request.mock.calls[0]![0]).toEqual(["b"]);
  expect(poller.isPolling()).toBe(true);
  poller.update(focusPollerState(null, true));
  expect(poller.isPolling()).toBe(false);
  expect(stops).toBe(1);
  poller.update(focusPollerState("b", false));
  expect(poller.isPolling()).toBe(false);
});

test("reduced motion: no travelling pulses, no idle animation, only a still ripple", () => {
  const spy = spyOn(window, "matchMedia").mockImplementation(() => ({ matches: true }) as MediaQueryList);
  openNode("a");
  expect(container.querySelector(".ag-focus-map svg")!.classList.contains("ag-f-idle")).toBe(false);
  view.focusActivity([]);
  view.focusActivity([call("files", "running", 100, "a")]);
  expect(container.querySelectorAll(".ag-f-pulse")).toHaveLength(0);
  expect(container.querySelectorAll(".ag-f-comet")).toHaveLength(0);
  expect(container.querySelector(".ag-f-ripple")!.classList.contains("is-still")).toBe(true);
  expect(spoke("files").getAttribute("data-calls")).toBe("1");
  spy.mockRestore();
});

test("the icon sits at the station centre and the count is outside the circle", () => {
  openNode("b");
  view.focusActivity([call("files", "completed", 3000, "b"), call("files", "completed", 2000, "b")]);
  for (const kind of ["files", "shell", "user", "agents"] as const) {
    const body = station(kind).querySelector(".ag-f-station-body")!;
    const [cx, cy] = [Number(body.getAttribute("cx")), Number(body.getAttribute("cy"))];
    const transform = station(kind).querySelector(`[data-icon="${kind}"]`)!.getAttribute("transform")!;
    expect(transform.startsWith(`translate(${cx} ${cy}) `)).toBe(true);
  }
  expect(station("files").querySelector(".ag-f-station-body")!.getAttribute("stroke-width")).toBeNull();
  const total = station("files").querySelector(".ag-f-total")!;
  expect(total.textContent).toBe("2");
  expect(total.closest(".ag-f-label")).not.toBeNull();
  expect(station("files").querySelector(".ag-f-station-icon")!.contains(total)).toBe(false);
});

test("the idle animation class is present while the view is open", () => {
  openNode("b");
  expect(container.querySelector(".ag-focus-map svg")!.classList.contains("ag-f-idle")).toBe(true);
  expect(container.querySelector(".ag-f-hub-glow")).not.toBeNull();
});

test("a start event adds the spoke comet, ripple and pop, and they are removed after", async () => {
  openNode("b");
  view.focusActivity([]);
  view.focusActivity([call("files", "running", 10, "b")]);
  expect(container.querySelectorAll(".ag-f-comet")).toHaveLength(1);
  expect(container.querySelectorAll(".ag-f-ripple")).toHaveLength(1);
  expect(container.querySelectorAll(".ag-f-trail").length).toBeGreaterThan(0);
  expect(station("files").classList.contains("is-pop")).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 1050));
  expect(container.querySelectorAll(".ag-f-comet, .ag-f-ripple, .ag-f-trail, .ag-f-pulse")).toHaveLength(0);
  expect(station("files").classList.contains("is-pop")).toBe(false);
});

test("an error adds a red ripple and a shake", () => {
  openNode("b");
  view.focusActivity([]);
  const running = call("shell", "running", 100, "b");
  view.focusActivity([running]);
  view.focusActivity([{ ...running, status: "error", endedAt: Date.now() }]);
  expect(container.querySelector(".ag-f-ripple.is-error")).not.toBeNull();
  expect(station("shell").classList.contains("is-shake")).toBe(true);
});
