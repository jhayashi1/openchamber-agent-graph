import { classifyTool, type ActivityKind } from "./activity-kind"

export type ActivityStatus = "running" | "completed" | "error"
export type ActivityCall = {
  sessionId: string
  callId: string
  tool: string
  kind: ActivityKind
  status: ActivityStatus
  startedAt: number
  endedAt?: number
}

export const MAX_CALLS_PER_SESSION = 50

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)
const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined)

function statusOf(value: unknown): ActivityStatus {
  if (value === "completed") return "completed"
  if (value === "error" || value === "failed" || value === "denied" || value === "rejected") return "error"
  return "running"
}

function callFrom(
  sessionId: string,
  callId: string,
  tool: string,
  kind: ActivityKind,
  status: ActivityStatus,
  fallbackAt: number,
  time: unknown,
): ActivityCall {
  const span = isObject(time) ? time : {}
  const startedAt = asNumber(span.start) ?? asNumber(span.created) ?? fallbackAt
  const end = asNumber(span.end) ?? asNumber(span.completed)
  const call: ActivityCall = { sessionId, callId, tool, kind, status, startedAt }
  if (status !== "running") call.endedAt = end ?? startedAt
  return call
}

/** Tool calls of one session. Reads names, statuses and times; never copies input or output text out of this function. */
export function findActivity(sessionId: string, messages: unknown[], since: number): ActivityCall[] {
  const calls: ActivityCall[] = []
  if (!Array.isArray(messages)) return calls
  for (const [messageIndex, message] of messages.entries()) {
    if (!isObject(message)) continue
    const fields = isObject(message.info) ? message.info : message
    const messageTime = isObject(fields.time) ? fields.time : {}
    const created = asNumber(messageTime.created) ?? 0
    const messageId = typeof fields.id === "string" ? fields.id : `m${messageIndex}`
    const parts = Array.isArray(message.content) ? message.content : Array.isArray(message.parts) ? message.parts : []
    for (const [partIndex, part] of parts.entries()) {
      if (!isObject(part)) continue
      const name = part.name ?? part.tool
      if (typeof name !== "string" || !isObject(part.state)) continue
      const state = part.state
      const callId = String(part.callID ?? part.callId ?? part.id ?? `${messageId}:${partIndex}`)
      const status = statusOf(state.status)
      const inner = name === "execute" && isObject(state.metadata) && Array.isArray(state.metadata.toolCalls) ? state.metadata.toolCalls : []
      if (inner.length > 0) {
        for (const [index, call] of inner.entries()) {
          if (!isObject(call) || typeof call.tool !== "string") continue
          const callStatus = call.status === undefined ? status : statusOf(call.status)
          calls.push(callFrom(sessionId, `${callId}:${index}`, call.tool, classifyTool(call.tool, call.input), callStatus, created, call.time ?? state.time))
        }
        continue
      }
      calls.push(callFrom(sessionId, callId, name, classifyTool(name, state.input), status, created, state.time))
    }
  }
  return calls
    .filter((call) => call.startedAt > since || (call.endedAt ?? 0) > since)
    .sort((a, b) => Math.max(b.startedAt, b.endedAt ?? 0) - Math.max(a.startedAt, a.endedAt ?? 0))
    .slice(0, MAX_CALLS_PER_SESSION)
}
