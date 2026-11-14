import {
  connectHost,
  HostRequestError,
  type GuestProject,
  type GuestSessionsSnapshot,
} from "@openchamber/sdk";
import { applyHostReady, mountBanner, mountEmpty, mountSpinner } from "@openchamber/sdk/ui";
import { createActivityPoller, focusPollerState, isActivityCall } from "./activity";
import { buildAgentGraph, type MessageEdge } from "./graph";
import { chooseProject } from "./choose-project";
import { createGraphView } from "./render";
import { normalise, serialise, SETTINGS_KEY, type AgentGraphSettings } from "./settings";

const host = connectHost();
const root = document.querySelector("#root")!;

let currentSessionId: string | null = null;
let currentDirectory: string | null = null;
let hasGraph = false;
let waitingForSession = false;
let mounted: { dispose: () => void } | null = null;
let view: ReturnType<typeof createGraphView> | null = null;
let unsubscribe: (() => void) | null = null;
let generation = 0;
let settings = normalise(undefined);

const UI_KEY = "ui";
let sections: string[] = [];

const MIN_REFETCH_MS = 3000;
const POLL_MS = 15000;
const MESSAGES_OFF_HINT =
  "Approve the extension's service in Settings -> Extensions to see messages between sessions";
let latestSnapshot: GuestSessionsSnapshot | null = null;
let messageEdges: MessageEdge[] = [];
let messagesOffReason: string | null = null;
let fetchedKey: string | null = null;
let lastFetchAt = 0;
let fetchTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let requestSeq = 0;

function resetMessages() {
  messageEdges = [];
  messagesOffReason = null;
  fetchedKey = null;
  latestSnapshot = null;
  requestSeq++;
  activityPoller.reset();
  if (fetchTimer) clearTimeout(fetchTimer);
  fetchTimer = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function messageEdgeReason(error: unknown): string {
  if (error instanceof HostRequestError && error.code === "NOT_GRANTED") return MESSAGES_OFF_HINT;
  if (error instanceof HostRequestError && error.code === "NO_SERVICE") return MESSAGES_OFF_HINT;
  if (error instanceof HostRequestError && error.code === "SERVICE_FAILED") {
    return "The extension's service failed to run. Messages between sessions are not shown";
  }
  return "Could not load messages between sessions. Trying again on the next change";
}

function isMessageEdge(value: unknown): value is MessageEdge {
  return (
    typeof value === "object" &&
    value !== null &&
    "from" in value &&
    typeof value.from === "string" &&
    "to" in value &&
    typeof value.to === "string" &&
    "count" in value &&
    typeof value.count === "number" &&
    "lastAt" in value &&
    typeof value.lastAt === "number"
  );
}

function treeSessions(snapshot: GuestSessionsSnapshot) {
  if (currentSessionId === null) return [];
  const treeIds = new Set(buildAgentGraph(snapshot.sessions, currentSessionId)?.nodes.map((node) => node.id));
  return snapshot.sessions.filter((session) => treeIds.has(session.id));
}

function scheduleEdgeFetch() {
  if (fetchTimer) return;
  const wait = Math.max(0, lastFetchAt + MIN_REFETCH_MS - Date.now());
  const run = generation;
  fetchTimer = setTimeout(() => {
    fetchTimer = null;
    if (run === generation) void fetchMessageEdges(run);
  }, wait);
}

async function fetchMessageEdges(run: number) {
  const snapshot = latestSnapshot;
  if (!snapshot) return;
  const sessions = treeSessions(snapshot);
  if (sessions.length === 0) return;
  const seq = ++requestSeq;
  lastFetchAt = Date.now();
  try {
    const result = await host.serviceRequest({
      method: "GET",
      path: "/edges",
      query: { sessions: sessions.map((session) => session.id).join(",") },
    });
    if (run !== generation || seq !== requestSeq) return;
    if (result.status !== 200) {
      messagesOffReason = messageEdgeReason(null);
      fetchedKey = null;
    } else {
      const body: unknown = JSON.parse(result.body);
      const edges = typeof body === "object" && body !== null && "edges" in body ? body.edges : [];
      messageEdges = Array.isArray(edges) ? edges.filter(isMessageEdge) : [];
      messagesOffReason = null;
    }
  } catch (error) {
    if (run !== generation || seq !== requestSeq) return;
    messagesOffReason = messageEdgeReason(error);
    fetchedKey = null;
  }
  if (latestSnapshot) showSnapshot(latestSnapshot, false);
}

function requestEdgesIfChanged(snapshot: GuestSessionsSnapshot) {
  const sessions = treeSessions(snapshot);
  const key = sessions.map((session) => `${session.id}:${session.updatedAt}`).sort().join(",");
  if (key !== fetchedKey) {
    fetchedKey = key;
    scheduleEdgeFetch();
  }
  const active = sessions.some(
    (session) =>
      session.activity === "running" ||
      session.activity === "retrying" ||
      session.activity === "waiting-question" ||
      session.activity === "waiting-permission",
  );
  if (active && !pollTimer) {
    pollTimer = setInterval(scheduleEdgeFetch, POLL_MS);
  } else if (!active && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function requestActivity(sessionIds: readonly string[], since: number) {
  const result = await host.serviceRequest({
    method: "GET",
    path: "/activity",
    query: { sessions: sessionIds.join(","), since: String(since) },
  });
  if (result.status !== 200) return [];
  const body: unknown = JSON.parse(result.body);
  const calls = typeof body === "object" && body !== null && "calls" in body ? body.calls : [];
  return Array.isArray(calls) ? calls.filter(isActivityCall) : [];
}

const activityPoller = createActivityPoller({
  request: requestActivity,
  emit: (events) => view?.pulse(events),
});

/** The focus view reads the whole recent history each tick (since 0), so a call that ends between ticks is never stuck as running. */
let focusedId: string | null = null;
const focusPoller = createActivityPoller({
  request: async (sessionIds) => {
    const calls = await requestActivity(sessionIds, 0);
    view?.focusActivity(calls);
    return calls;
  },
  emit: () => {},
});

function syncFocus() {
  focusPoller.update(focusPollerState(focusedId, document.visibilityState !== "hidden"));
}

function syncActivity(snapshot: GuestSessionsSnapshot | null) {
  const sessions = snapshot ? treeSessions(snapshot) : [];
  activityPoller.update({
    enabled: settings.toolPulses,
    visible: document.visibilityState !== "hidden",
    active: sessions.some((session) => ["running", "retrying", "waiting-question", "waiting-permission"].includes(session.activity)),
    sessionIds: sessions.map((session) => session.id),
  });
}

document.addEventListener("visibilitychange", () => {
  syncActivity(latestSnapshot);
  syncFocus();
});

function clear() {
  focusedId = null;
  focusPoller.reset();
  view?.dispose();
  view = null;
  mounted?.dispose();
  mounted = null;
  root.replaceChildren();
}

function showEmpty(title: string, body: string) {
  clear();
  mounted = mountEmpty(root, { title, body });
}

function showSpinner(label = "Loading agents") {
  clear();
  mounted = mountSpinner(root, { label });
}

function showError(error: unknown) {
  clear();
  hasGraph = false;
  if (error instanceof HostRequestError && error.code === "NOT_GRANTED") {
    mounted = mountBanner(root, {
      tone: "error",
      title: "Sessions permission needed",
      body: "Approve the Sessions permission in Settings -> Extensions.",
    });
    return;
  }
  const code = error instanceof HostRequestError ? error.code : "ERROR";
  const message = error instanceof Error ? error.message : String(error);
  mounted = mountBanner(root, { tone: "error", title: code, body: message });
}

function showSnapshot(snapshot: GuestSessionsSnapshot, sessionsChanged = true) {
  if (currentSessionId === null) return;
  latestSnapshot = snapshot;
  const graph = buildAgentGraph(snapshot.sessions, currentSessionId, messageEdges);
  if (graph) {
    if (!view) {
      mounted?.dispose();
      mounted = null;
      view = createGraphView(
        root,
        (sessionId) => {
          host.openSession(sessionId).catch(showError);
        },
        {
          settings,
          sections,
          onSectionsSave: (next: string[]) => {
            sections = next;
            host.storage.set(UI_KEY, { sections: next }).catch(() => {});
          },
          onFocusChange: (sessionId) => {
            focusedId = sessionId;
            focusPoller.reset();
            syncFocus();
          },
          onSettingsSave: (next: AgentGraphSettings) => {
            settings = next;
            syncActivity(latestSnapshot);
            host.storage.set(SETTINGS_KEY, serialise(next)).catch(() => {});
          },
        },
      );
    }
    hasGraph = true;
    view.update(graph);
    view.setMessagesOff(messagesOffReason);
    if (sessionsChanged) requestEdgesIfChanged(snapshot);
    syncActivity(snapshot);
  } else if (snapshot.state === "loading" && !hasGraph) {
    showSpinner();
  } else if (snapshot.state === "error") {
    clear();
    hasGraph = false;
    mounted = mountBanner(root, {
      tone: "error",
      title: "Could not load sessions",
      body: "OpenChamber could not load this project's sessions. Reopen the panel to retry.",
    });
  } else if (waitingForSession && !hasGraph) {
    showSpinner("Loading this session's agents");
  } else if (snapshot.state === "ready") {
    hasGraph = false;
    showEmpty(
      "Session not found",
      "This session is not in a registered OpenChamber project, so its agents cannot be shown.",
    );
  }
}

async function resolve() {
  const run = ++generation;
  unsubscribe?.();
  unsubscribe = null;
  hasGraph = false;
  waitingForSession = false;
  resetMessages();

  const sessionId = currentSessionId;
  if (sessionId === null) {
    showEmpty("No session", "Open a chat to see its agents.");
    return;
  }
  showSpinner();

  try {
    const { projects } = await host.listProjects();
    if (run !== generation) return;

    const snapshots = new Map<string, GuestSessionsSnapshot>();
    for (const project of projects) {
      const snapshot = await host.listSessions(project.id);
      if (run !== generation) return;
      snapshots.set(project.id, snapshot);
    }
    const choice = chooseProject(projects, snapshots, sessionId, currentDirectory);
    if (choice === null) {
      showEmpty(
        "Session not found",
        "This session's folder is not in a registered OpenChamber project, so its agents cannot be shown.",
      );
      return;
    }
    waitingForSession = !choice.found;
    const projectId = choice.projectId;

    const stop = await host.onSessions(projectId, (snapshot) => {
      if (run === generation) showSnapshot(snapshot);
    });
    if (run !== generation) {
      stop();
      return;
    }
    unsubscribe = stop;
  } catch (error) {
    if (run === generation) showError(error);
  }
}

host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement);
  host.storage
    .get(SETTINGS_KEY)
    .then((stored) => {
      settings = normalise(stored);
      view?.setSettings(settings);
      syncActivity(latestSnapshot);
    })
    .catch(() => {});
  host.storage
    .get(UI_KEY)
    .then((stored) => {
      const ids = (stored as { sections?: unknown } | null | undefined)?.sections;
      sections = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
      view?.setSections(sections);
    })
    .catch(() => {});
});

host.onDirectory((directory) => {
  if (directory === currentDirectory) return;
  currentDirectory = directory;
  void resolve();
});

host.onSession((session) => {
  const sessionId = session?.id ?? null;
  if (sessionId === currentSessionId) return;
  currentSessionId = sessionId;
  void resolve();
});
