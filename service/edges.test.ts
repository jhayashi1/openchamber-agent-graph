import { expect, test } from "bun:test"
import { findSendEdges, mergeSendEdges } from "./edges"

const me = "ses_sender"
const target = "ses_target"
const sendInput = { action: "session.send", parameters: { sessionId: target, prompt: "Question" } }

const direct = (status: string, input: unknown = sendInput) => ({
  time: { created: 100 },
  content: [{ type: "tool", name: "openchamber", state: { status, input } }],
})

const codeMode = (status: string, input: unknown = sendInput) => ({
  time: { created: 200 },
  content: [
    {
      type: "tool",
      name: "execute",
      state: { status: "completed", input: { code: "..." }, metadata: { toolCalls: [{ tool: "openchamber", status, input }] } },
    },
  ],
})

test("finds a direct send", () => {
  expect(findSendEdges(me, [direct("completed")])).toEqual([{ from: me, to: target, at: 100, source: "sender" }])
})

test("finds a Code Mode send", () => {
  expect(findSendEdges(me, [codeMode("completed")])).toEqual([{ from: me, to: target, at: 200, source: "sender" }])
})

test("accepts the parts[] and tool shape", () => {
  const message = { time: { created: 300 }, parts: [{ type: "tool", tool: "openchamber", state: { status: "completed", input: sendInput } }] }
  expect(findSendEdges(me, [message])).toEqual([{ from: me, to: target, at: 300, source: "sender" }])
})

test("reads time and metadata from info in the { info, parts } shape", () => {
  const received = { info: { role: "user", time: { created: 500 }, metadata: { openchamber: { promptedBy: { sessionID: "ses_other" } } } }, parts: [{ type: "text", text: "Hi" }] }
  const sent = { info: { role: "assistant", time: { created: 600 } }, parts: [{ type: "tool", tool: "openchamber", state: { status: "completed", input: sendInput } }] }
  expect(findSendEdges(me, [received, sent])).toEqual([
    { from: "ses_other", to: me, at: 500, source: "receiver" },
    { from: me, to: target, at: 600, source: "sender" },
  ])
})

test("finds the receiver side", () => {
  const message = { metadata: { openchamber: { promptedBy: { sessionID: "ses_other", title: "T" } } }, time: { created: 400 }, text: "Hi" }
  expect(findSendEdges(me, [message])).toEqual([{ from: "ses_other", to: me, at: 400, source: "receiver" }])
})

test("ignores calls that are not completed", () => {
  expect(findSendEdges(me, [direct("error"), direct("running"), codeMode("error"), codeMode("pending")])).toEqual([])
})

test("ignores other actions", () => {
  const create = { action: "session.create", parameters: { prompt: "x" } }
  const status = { action: "session.status", parameters: { sessionId: target } }
  expect(findSendEdges(me, [direct("completed", create), direct("completed", status), codeMode("completed", status)])).toEqual([])
})

test("ignores malformed data", () => {
  const bad = [null, 1, "x", [], {}, { content: "x" }, { content: [null, { name: "openchamber" }, { name: "execute", state: { metadata: { toolCalls: "x" } } }] }, direct("completed", { action: "session.send", parameters: { sessionId: 5 } })]
  expect(findSendEdges(me, bad)).toEqual([])
  expect(findSendEdges(me, undefined as unknown as unknown[])).toEqual([])
})

test("merge counts a send seen from both sides once", () => {
  const events = [
    { from: "a", to: "b", at: 1, source: "sender" as const },
    { from: "a", to: "b", at: 2, source: "sender" as const },
    { from: "a", to: "b", at: 3, source: "receiver" as const },
    { from: "b", to: "a", at: 5, source: "receiver" as const },
  ]
  expect(mergeSendEdges(events)).toEqual([
    { from: "a", to: "b", count: 2, lastAt: 3 },
    { from: "b", to: "a", count: 1, lastAt: 5 },
  ])
})
