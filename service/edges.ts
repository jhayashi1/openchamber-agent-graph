export type SendEvent = { from: string; to: string; at: number; source: "sender" | "receiver" }
export type MessageEdge = { from: string; to: string; count: number; lastAt: number }

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const asString = (value: unknown) => (typeof value === "string" && value ? value : undefined)

function sendTarget(input: unknown) {
  if (!isObject(input) || input.action !== "session.send" || !isObject(input.parameters)) return undefined
  return asString(input.parameters.sessionId)
}

function completedSendTargets(part: Json) {
  const state = isObject(part.state) ? part.state : undefined
  if (!state) return []
  const name = part.name ?? part.tool
  if (name === "openchamber") {
    const target = state.status === "completed" ? sendTarget(state.input) : undefined
    return target ? [target] : []
  }
  if (name === "execute" && isObject(state.metadata) && Array.isArray(state.metadata.toolCalls)) {
    return state.metadata.toolCalls
      .filter(isObject)
      .filter((call) => call.tool === "openchamber" && call.status === "completed")
      .flatMap((call) => sendTarget(call.input) ?? [])
  }
  return []
}

export function findSendEdges(sessionId: string, messages: unknown[]): SendEvent[] {
  const events: SendEvent[] = []
  if (!Array.isArray(messages)) return events
  for (const message of messages) {
    if (!isObject(message)) continue
    const fields = isObject(message.info) ? message.info : message
    const time = isObject(fields.time) ? fields.time : {}
    const at = typeof time.created === "number" ? time.created : 0

    const promptedBy = isObject(fields.metadata) && isObject(fields.metadata.openchamber)
      ? fields.metadata.openchamber.promptedBy
      : undefined
    const sender = isObject(promptedBy) ? asString(promptedBy.sessionID) : undefined
    if (sender) events.push({ from: sender, to: sessionId, at, source: "receiver" })

    const parts = Array.isArray(message.content) ? message.content : Array.isArray(message.parts) ? message.parts : []
    for (const part of parts) {
      if (!isObject(part)) continue
      for (const to of completedSendTargets(part)) events.push({ from: sessionId, to, at, source: "sender" })
    }
  }
  return events
}

export function mergeSendEdges(events: SendEvent[]): MessageEdge[] {
  const pairs = new Map<string, { from: string; to: string; sender: number; receiver: number; lastAt: number }>()
  for (const event of events) {
    const key = JSON.stringify([event.from, event.to])
    const pair = pairs.get(key) ?? { from: event.from, to: event.to, sender: 0, receiver: 0, lastAt: 0 }
    pair[event.source] += 1
    pair.lastAt = Math.max(pair.lastAt, event.at)
    pairs.set(key, pair)
  }
  return [...pairs.values()].map(({ from, to, sender, receiver, lastAt }) => ({
    from,
    to,
    count: Math.max(sender, receiver),
    lastAt,
  }))
}
