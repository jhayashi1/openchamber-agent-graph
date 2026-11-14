import type { GuestSessionRecord } from "@openchamber/sdk";
import { buildAgentGraph } from "../panel/graph";
import { createGraphView } from "../panel/render";
import { normalise } from "../panel/settings";

const themes = {
  light: {
    "color-scheme": "light",
    "--oc-bg": "#ffffff",
    "--oc-elevated": "#f6f6f7",
    "--oc-fg": "#1c1c1f",
    "--oc-muted": "#5f6368",
    "--oc-border": "#c9cbd1",
    "--oc-hover": "#ececef",
    "--oc-focus": "#2563eb",
    "--oc-primary": "#2563eb",
    "--oc-success": "#16a34a",
    "--oc-warning": "#d97706",
    "--oc-error": "#dc2626",
    "--oc-info": "#0284c7",
    "--oc-font": "system-ui, sans-serif",
  },
  dark: {
    "color-scheme": "dark",
    "--oc-bg": "#161618",
    "--oc-elevated": "#222226",
    "--oc-fg": "#ececf0",
    "--oc-muted": "#a0a3ab",
    "--oc-border": "#44464d",
    "--oc-hover": "#2c2c31",
    "--oc-focus": "#7aa2ff",
    "--oc-primary": "#7aa2ff",
    "--oc-success": "#4ade80",
    "--oc-warning": "#fbbf24",
    "--oc-error": "#f87171",
    "--oc-info": "#38bdf8",
    "--oc-font": "system-ui, sans-serif",
  },
};

function session(
  id: string,
  title: string,
  agent: string,
  parentId: string | null,
  createdAt: number,
  activity: GuestSessionRecord["activity"],
  outcome: GuestSessionRecord["outcome"],
): GuestSessionRecord {
  return {
    id,
    title,
    agent,
    parentId,
    createdAt,
    updatedAt: createdAt,
    activity,
    outcome,
    projectId: "p1",
    directory: "/work/app",
    archivedAt: null,
    worktree: null,
    items: [],
  };
}

const MINUTE = 60_000;
const now = Date.now();
const sessions = [
  session("root", "Build the checkout page", "build", null, now - 300 * MINUTE, "idle", null),
  session("explore-1", "Find existing payment forms", "explore", "root", now - 240 * MINUTE, "idle", "completed"),
  session("general-1", "Implement the card form", "general", "root", now - 150 * MINUTE, "running", null),
  session("explore-2", "Look up validation helpers", "explore", "general-1", now - 90 * MINUTE, "waiting-permission", null),
  session("general-2", "Update the API client", "general", "root", now - 60 * MINUTE, "idle", "failed"),
  session("explore-3", "Read the Stripe SDK docs", "explore", "general-1", now - 35 * MINUTE, "idle", "completed"),
  session("general-3", "Write card form tests", "general", "general-1", now - 20 * MINUTE, "running", null),
  session("explore-4", "Check the test setup", "explore", "general-3", now - 9 * MINUTE, "idle", "completed"),
  session("explore-5", "Find the API schema", "explore", "general-2", now - 4 * MINUTE, "waiting-question", null),
  session("general-4", "Add retry handling", "general", "general-2", now - 1 * MINUTE, "retrying", null),
  session("review-1", "Review the final diff", "review", "root", now - 0 * MINUTE, "idle", null),
  session("outside-1", "Plan the release notes", "build", null, now - 120 * MINUTE, "idle", null),
];

const messageEdges = [
  { from: "general-1", to: "explore-1", count: 3, lastAt: now - 30 * MINUTE },
  { from: "general-2", to: "explore-1", count: 1, lastAt: now - 5 * MINUTE },
  { from: "general-3", to: "outside-1", count: 2, lastAt: now - 2 * MINUTE },
];

const container = document.querySelector("#root")!;
const view = createGraphView(container, (id) => console.log("open chat", id));
const showGraph = () => {
  const graph = buildAgentGraph(sessions, "general-1", messageEdges);
  if (graph) view.update(graph);
};
showGraph();

const MAX_GROWN = 5;
if (new URLSearchParams(location.search).get("grow") === "1") {
  let grown = 0;
  const timer = setInterval(() => {
    grown += 1;
    sessions.push(session(`grown-${grown}`, `Grown child ${grown}`, "explore", "general-1", Date.now(), "running", null));
    showGraph();
    if (grown === MAX_GROWN) clearInterval(timer);
  }, 3000);
}

const beamPause = new URLSearchParams(location.search).get("beamPause");
if (beamPause !== null) {
  const style = document.createElement("style");
  style.textContent = `.ag-beam { animation: ag-beam-travel 2s linear -${Number(beamPause) * 2}s paused both !important; }
.ag-node.is-running .ag-halo { animation-play-state: paused !important; animation-delay: -${Number(beamPause) * 1.6}s !important; }
.ag-node.is-running .ag-halo-late { animation-delay: -${((Number(beamPause) + 0.5) % 1) * 1.6}s !important; }
.ag-node.is-waiting .ag-halo, .ag-node.is-waiting .ag-body, .ag-node.is-waiting .ag-backdrop { animation-play-state: paused !important; animation-delay: -${Number(beamPause) * 2.4}s !important; animation-direction: normal !important; animation-iteration-count: 1 !important; animation-fill-mode: both !important; }`;
  document.head.append(style);
}

const query = new URLSearchParams(location.search);
if (query.get("custom") === "1") {
  view.setSettings({ ...normalise(undefined), beamColor: "#f97316", beamLength: 64, beamWidth: 3, messageColor: "#a855f7", messageOpacity: 70 });
}
const palette = query.get("palette");
if (palette !== null) view.setSettings({ ...normalise({ nodePalette: palette }) });
const hubPull = query.get("hubPull");
if (hubPull !== null) view.setSettings({ ...normalise({ hubPull: Number(hubPull) }) });
const sections = query.get("sections");
if (sections !== null) view.setSections(sections.split(","));
if (query.get("settings") === "open") {
  container.querySelector<HTMLButtonElement>(".ag-settings-button")!.click();
}

if (query.get("pulses") !== null) {
  const kinds = ["files", "shell", "network", "mcp", "browser", "agents", "skills", "memory", "user"] as const;
  const ids = ["general-1", "general-3", "explore-2", "general-4"];
  const still = query.get("pulses") === "still";
  const fire = () => {
    view.pulse(
      kinds.map((kind, index) => ({
        sessionId: ids[index % ids.length]!,
        callId: `fake-${Math.random()}`,
        kind,
        phase: index === 3 ? ("error" as const) : index % 2 ? ("end" as const) : ("start" as const),
      })),
    );
    view.pulse(Array.from({ length: 5 }, (_, i) => ({ sessionId: "general-1", callId: `burst-${i}`, kind: "files" as const, phase: "start" as const })));
  };
  if (still) setInterval(fire, 250);
  else setInterval(fire, 1200);
}

const focusId = query.get("focus");
if (focusId !== null) {
  const kindsUsed = ["files", "shell", "files", "network", "mcp", "browser", "agents", "skills", "memory", "user", "other"] as const;
  const tools = { files: "read", shell: "bash", network: "webfetch", mcp: "atlassian_get_page", browser: "openchamber_web", agents: "task", skills: "skill", memory: "openchamber_knowledge", user: "question", other: "todowrite" };
  let counter = 0;
  const startedAt = Date.now();
  const make = (kind: (typeof kindsUsed)[number], ago: number, status: "running" | "completed" | "error") => ({
    sessionId: focusId,
    callId: `fake-${counter++}`,
    tool: tools[kind],
    kind,
    status,
    startedAt: Date.now() - ago,
    ...(status === "running" ? {} : { endedAt: Date.now() - ago + 800 }),
  });
  const history = Array.from({ length: 40 }, (_, i) => make(kindsUsed[(i * 7) % kindsUsed.length]!, (40 - i) * 20_000, i % 13 === 5 ? "error" : "completed"));
  const live = [make("shell", 9000, "running"), make("shell", 3000, "running"), make("files", 1000, "running")];
  container.querySelector<SVGGElement>(`[data-session-id="${focusId}"]`)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  view.focusActivity(history);
  view.focusActivity([...history, ...live]);
  if (query.get("focusLive") !== "still") {
    setInterval(() => {
      const kind = kindsUsed[Math.floor(Math.random() * kindsUsed.length)]!;
      const call = make(kind, 0, "running");
      history.push(call);
      view.focusActivity([...history, ...live]);
      setTimeout(() => {
        Object.assign(call, { status: Math.random() < 0.2 ? "error" : "completed", endedAt: Date.now() });
        view.focusActivity([...history, ...live]);
      }, 1500);
    }, 2500);
  }
}

const zoom = Number(new URLSearchParams(location.search).get("zoom"));
if (zoom > 0) {
  const stage = container.querySelector(".ag-stage")!;
  const wheel = Math.log(zoom) / -0.002;
  stage.dispatchEvent(new WheelEvent("wheel", { deltaY: wheel, clientX: stage.getBoundingClientRect().left + stage.clientWidth / 2, clientY: stage.getBoundingClientRect().top + stage.clientHeight / 2, bubbles: true, cancelable: true }));
}

function applyTheme(name: keyof typeof themes) {
  for (const [property, value] of Object.entries(themes[name])) {
    document.documentElement.style.setProperty(property, value);
  }
}

let current: keyof typeof themes = location.hash === "#dark" ? "dark" : "light";
applyTheme(current);
document.querySelector("#toggle")!.addEventListener("click", () => {
  current = current === "light" ? "dark" : "light";
  applyTheme(current);
});
