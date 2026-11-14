import { expect, test } from "bun:test"
import { findActivity, MAX_CALLS_PER_SESSION } from "./activity"

const secret = "SECRET-PROMPT-TEXT"
const tool = (name: string, callID: string, status: string, start: number, end?: number, extra: object = {}) => ({
  type: "tool",
  name,
  callID,
  state: { status, input: { command: `curl ${secret}` }, output: secret, error: secret, time: { start, end }, ...extra },
})
const message = (created: number, content: unknown[]) => ({ id: `msg_${created}`, type: "assistant", time: { created }, content })

test("reports status, kind and times for tool parts", () => {
  const calls = findActivity("s", [message(100, [tool("bash", "c1", "running", 110), tool("read", "c2", "completed", 120, 130), tool("edit", "c3", "error", 140, 150)])], 0)
  expect(calls).toEqual([
    { sessionId: "s", callId: "c3", tool: "edit", kind: "files", status: "error", startedAt: 140, endedAt: 150 },
    { sessionId: "s", callId: "c2", tool: "read", kind: "files", status: "completed", startedAt: 120, endedAt: 130 },
    { sessionId: "s", callId: "c1", tool: "bash", kind: "network", status: "running", startedAt: 110 },
  ])
})

test("filters by since on start or end", () => {
  const calls = findActivity("s", [message(1, [tool("read", "old", "completed", 10, 20), tool("read", "endsLater", "completed", 10, 200), tool("read", "new", "running", 150)])], 100)
  expect(calls.map((call) => call.callId).sort()).toEqual(["endsLater", "new"])
})

test("caps calls per session to the newest", () => {
  const parts = Array.from({ length: 80 }, (_, index) => tool("read", `c${index}`, "completed", index + 1, index + 2))
  const calls = findActivity("s", [message(1, parts)], 0)
  expect(calls).toHaveLength(MAX_CALLS_PER_SESSION)
  expect(calls[0]!.callId).toBe("c79")
})

test("classifies every inner call of execute", () => {
  const part = tool("execute", "ex", "completed", 10, 20, {
    metadata: { toolCalls: [{ tool: "openchamber", status: "completed", input: { action: "session.send" } }, { tool: "notes.search", status: "error" }, { tool: "tools.tickets.get_issue", status: "completed" }] },
  })
  const calls = findActivity("s", [message(5, [part])], 0)
  expect(calls.map((call) => [call.callId, call.kind, call.status])).toEqual([
    ["ex:0", "agents", "completed"],
    ["ex:1", "mcp", "error"],
    ["ex:2", "mcp", "completed"],
  ])
})

test("never leaks input or output", () => {
  const calls = findActivity("s", [message(1, [tool("bash", "c1", "error", 5, 6)])], 0)
  expect(JSON.stringify(calls)).not.toContain(secret)
})

test("reads info and parts message shapes", () => {
  const calls = findActivity("s", [{ info: { id: "m", time: { created: 50 } }, parts: [{ type: "tool", tool: "glob", state: { status: "pending" } }] }], 0)
  expect(calls[0]).toMatchObject({ tool: "glob", kind: "files", status: "running", startedAt: 50 })
})
