import type { ActivityCall, ActivityStatus } from "../service/activity";
import type { ActivityKind } from "../service/activity-kind";

export type { ActivityCall, ActivityKind, ActivityStatus };

export const ACTIVITY_KINDS: ActivityKind[] = ["files", "shell", "network", "mcp", "browser", "agents", "skills", "memory", "user", "other"];
export const ERROR_COLOR = "#ef4444";
export const LEGEND_KINDS: ActivityKind[] = ["files", "shell", "network", "mcp", "browser", "agents", "skills", "memory", "user"];

export type PulseEvent = { sessionId: string; callId: string; kind: ActivityKind; phase: "start" | "end" | "error" };

const MAX_SEEN = 4000;
const KIND_NAMES = new Set<string>(ACTIVITY_KINDS);
const STATUSES = new Set(["running", "completed", "error"]);

export function isActivityCall(value: unknown): value is ActivityCall {
  if (typeof value !== "object" || value === null) return false;
  const call = value as Record<string, unknown>;
  return (
    typeof call.sessionId === "string" &&
    typeof call.callId === "string" &&
    typeof call.kind === "string" &&
    KIND_NAMES.has(call.kind) &&
    typeof call.status === "string" &&
    STATUSES.has(call.status) &&
    typeof call.startedAt === "number"
  );
}

/** Turns polled calls into pulse events: each call emits one start and at most one end or error. */
export function createActivityTracker() {
  const seen = new Set<string>();
  return {
    diff(calls: readonly ActivityCall[]): PulseEvent[] {
      const events: PulseEvent[] = [];
      const ordered = [...calls].sort((a, b) => a.startedAt - b.startedAt);
      for (const call of ordered) {
        const base = { sessionId: call.sessionId, callId: call.callId, kind: call.kind };
        const key = `${call.sessionId}:${call.callId}`;
        if (!seen.has(`${key}:start`)) {
          seen.add(`${key}:start`);
          events.push({ ...base, phase: "start" });
        }
        if (call.status !== "running" && !seen.has(`${key}:end`)) {
          seen.add(`${key}:end`);
          events.push({ ...base, phase: call.status === "error" ? "error" : "end" });
        }
      }
      if (seen.size > MAX_SEEN) {
        for (const key of [...seen].slice(0, seen.size - MAX_SEEN / 2)) seen.delete(key);
      }
      return events;
    },
    reset() {
      seen.clear();
    },
  };
}

export const ACTIVITY_POLL_MS = 2500;
export const ACTIVITY_GRACE_MS = 30000;
const FIRST_LOOKBACK_MS = 5000;

export type PollerState = { enabled: boolean; visible: boolean; active: boolean; sessionIds: readonly string[] };

type PollerOptions = {
  request: (sessionIds: readonly string[], since: number) => Promise<ActivityCall[]>;
  emit: (events: PulseEvent[]) => void;
  now?: () => number;
  schedule?: (run: () => void, ms: number) => () => void;
};

/** Polls only while the panel is visible and an agent is running or waiting, or had a tool call in the last 30 seconds. */
export function createActivityPoller(options: PollerOptions) {
  const now = options.now ?? Date.now;
  const schedule =
    options.schedule ??
    ((run, ms) => {
      const timer = setInterval(run, ms);
      return () => clearInterval(timer);
    });
  const tracker = createActivityTracker();
  let state: PollerState = { enabled: false, visible: true, active: false, sessionIds: [] };
  let stop: (() => void) | null = null;
  let since = 0;
  let lastActivityAt = 0;
  let inFlight = false;
  let generation = 0;

  const wanted = () =>
    state.enabled &&
    state.visible &&
    state.sessionIds.length > 0 &&
    (state.active || now() - lastActivityAt < ACTIVITY_GRACE_MS);

  function halt() {
    stop?.();
    stop = null;
  }

  async function tick() {
    if (!wanted()) return halt();
    if (inFlight) return;
    inFlight = true;
    const run = generation;
    const asked = now();
    try {
      const calls = await options.request(state.sessionIds, since);
      if (run !== generation) return;
      since = Math.max(0, asked - ACTIVITY_POLL_MS);
      const events = tracker.diff(calls);
      if (events.length > 0) {
        lastActivityAt = now();
        options.emit(events);
      }
    } catch {
      // the next tick retries
    } finally {
      inFlight = false;
    }
  }

  return {
    update(next: PollerState) {
      state = next;
      if (!wanted()) return halt();
      if (state.active) lastActivityAt = Math.max(lastActivityAt, now());
      if (stop) return;
      if (since === 0) since = now() - FIRST_LOOKBACK_MS;
      stop = schedule(() => void tick(), ACTIVITY_POLL_MS);
      void tick();
    },
    reset() {
      halt();
      generation++;
      tracker.reset();
      since = 0;
      lastActivityAt = 0;
      inFlight = false;
    },
    isPolling: () => stop !== null,
    tick,
  };
}

/** The focus view polls only its own session, every tick, whether the agent is idle or not. */
export function focusPollerState(focusedId: string | null, visible: boolean): PollerState {
  return { enabled: focusedId !== null, visible, active: true, sessionIds: focusedId === null ? [] : [focusedId] };
}
