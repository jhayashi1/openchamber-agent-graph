import { expect, test } from "bun:test"
import { ACTIVITY_GRACE_MS, ACTIVITY_POLL_MS, createActivityPoller, createActivityTracker, isActivityCall, type ActivityCall, type PollerState } from "./activity"

const call = (callId: string, status: ActivityCall["status"], startedAt = 1): ActivityCall => ({ sessionId: "s", callId, tool: "read", kind: "files", status, startedAt, endedAt: status === "running" ? undefined : startedAt + 1 })

test("a start and an end each pulse once", () => {
  const tracker = createActivityTracker()
  expect(tracker.diff([call("a", "running")]).map((e) => e.phase)).toEqual(["start"])
  expect(tracker.diff([call("a", "running")])).toEqual([])
  expect(tracker.diff([call("a", "completed")]).map((e) => e.phase)).toEqual(["end"])
  expect(tracker.diff([call("a", "completed")])).toEqual([])
})

test("an error emits an error phase once; a call first seen as completed emits start and end", () => {
  const tracker = createActivityTracker()
  expect(tracker.diff([call("b", "error")]).map((e) => e.phase)).toEqual(["start", "error"])
  expect(tracker.diff([call("b", "error")])).toEqual([])
  expect(tracker.diff([call("c", "completed")]).map((e) => e.phase)).toEqual(["start", "end"])
})

test("validates calls from the service", () => {
  expect(isActivityCall(call("a", "running"))).toBe(true)
  expect(isActivityCall({ ...call("a", "running"), kind: "nope" })).toBe(false)
  expect(isActivityCall(null)).toBe(false)
})

function setup() {
  let time = 1_000_000
  const requests: number[] = []
  const emitted: unknown[][] = []
  let stops = 0
  let tickFn: (() => void) | null = null
  const poller = createActivityPoller({
    now: () => time,
    request: async (_ids, since) => {
      requests.push(since)
      return [call(`c${requests.length}`, "running", time)]
    },
    emit: (events) => emitted.push(events),
    schedule: (run, ms) => {
      expect(ms).toBe(ACTIVITY_POLL_MS)
      tickFn = run
      return () => {
        stops++
        tickFn = null
      }
    },
  })
  return { poller, requests, emitted, advance: (ms: number) => (time += ms), stops: () => stops, hasTimer: () => tickFn !== null }
}
const state = (patch: Partial<PollerState> = {}): PollerState => ({ enabled: true, visible: true, active: true, sessionIds: ["s"], ...patch })

test("polls while an agent is active and stops when disabled or hidden", async () => {
  const t = setup()
  t.poller.update(state())
  await Promise.resolve()
  expect(t.poller.isPolling()).toBe(true)
  expect(t.requests).toHaveLength(1)
  expect(t.emitted).toHaveLength(1)
  t.poller.update(state({ enabled: false }))
  expect(t.poller.isPolling()).toBe(false)
  t.poller.update(state({ visible: false }))
  expect(t.poller.isPolling()).toBe(false)
  t.poller.update(state())
  expect(t.poller.isPolling()).toBe(true)
})

test("keeps polling for 30 seconds after activity, then stops", async () => {
  const t = setup()
  t.poller.update(state())
  await Promise.resolve()
  t.poller.update(state({ active: false }))
  expect(t.poller.isPolling()).toBe(true)
  t.advance(ACTIVITY_GRACE_MS + 1)
  await t.poller.tick()
  expect(t.poller.isPolling()).toBe(false)
})

test("does not start without activity or sessions", () => {
  const t = setup()
  t.poller.update(state({ active: false }))
  expect(t.poller.isPolling()).toBe(false)
  t.poller.update(state({ sessionIds: [] }))
  expect(t.poller.isPolling()).toBe(false)
})
