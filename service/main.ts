import http from "node:http"
import { describeBody, describeMessages, writeDebugLine, type SessionReport } from "./debug"
import { findActivity, type ActivityCall } from "./activity"
import { findSendEdges, mergeSendEdges, type SendEvent } from "./edges"

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT)
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? ""
const opencodeUrl = process.env.OPENCHAMBER_OPENCODE_URL ?? ""
if (!port || !token || !opencodeUrl) {
  console.error("OPENCHAMBER_SERVICE_PORT, OPENCHAMBER_SERVICE_TOKEN and OPENCHAMBER_OPENCODE_URL are required")
  process.exit(1)
}

const dataDir = process.env.OPENCHAMBER_SERVICE_DATA_DIR
writeDebugLine(dataDir, {
  event: "start",
  node: process.version,
  env: Object.fromEntries(
    ["OPENCHAMBER_SERVICE_PORT", "OPENCHAMBER_SERVICE_TOKEN", "OPENCHAMBER_OPENCODE_URL", "OPENCHAMBER_SERVICE_DATA_DIR"].map((name) => [name, Boolean(process.env[name])]),
  ),
})

const maxSessions = 200
const maxParallel = 6
const pageSize = 200
const maxPages = 50
const cache = new Map<string, { updated: number; events: SendEvent[] }>()

class ReadError extends Error {
  constructor(readonly status: number) {
    super(`OpenCode returned ${status}`)
  }
}

async function readOpencode(path: string, onStatus?: (status: number) => void): Promise<unknown> {
  const response = await fetch(new URL(path, opencodeUrl), { headers: { Authorization: `Bearer ${token}` } })
  onStatus?.(response.status)
  if (!response.ok) throw new ReadError(response.status)
  return response.json()
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// OpenCode v2 answers { data, cursor: { previous?, next? } }; cursor.next is set on every non-empty page, so an empty or short page ends the walk. A plain array is one page.
async function readAllMessages(id: string, report: SessionReport) {
  const messages: unknown[] = []
  let cursor: string | undefined
  let pages = 0
  while (pages < maxPages) {
    const query = new URLSearchParams({ limit: String(pageSize) })
    if (cursor) query.set("cursor", cursor)
    const body = await readOpencode(`/api/session/${id}/message?${query}`, (status) => (report.messageStatus = status))
    if (pages === 0) describeBody(body, report)
    pages++
    if (Array.isArray(body)) {
      messages.push(...body)
      break
    }
    const data = isObject(body) && Array.isArray(body.data) ? body.data : []
    messages.push(...data)
    const next = isObject(body) && isObject(body.cursor) && typeof body.cursor.next === "string" ? body.cursor.next : undefined
    if (data.length < pageSize || !next || next === cursor) break
    cursor = next
  }
  report.pageCount = pages
  if (pages >= maxPages) report.pageCapHit = true
  return messages
}

const activityPageSize = 50
const activityMaxPages = 3

// Newest page first. A page that holds a message created before `since` ends the walk: older messages finished before that one began.
async function readRecentMessages(id: string, since: number) {
  const messages: unknown[] = []
  let cursor: string | undefined
  for (let pages = 0; pages < activityMaxPages; pages++) {
    const query = new URLSearchParams({ limit: String(activityPageSize) })
    if (cursor) query.set("cursor", cursor)
    const body = await readOpencode(`/api/session/${id}/message?${query}`)
    const data = Array.isArray(body) ? body : isObject(body) && Array.isArray(body.data) ? body.data : []
    messages.push(...data)
    const next = isObject(body) && isObject(body.cursor) && typeof body.cursor.next === "string" ? body.cursor.next : undefined
    const reachedSince = data.some((message) => {
      const fields = isObject(message) && isObject(message.info) ? message.info : message
      const time = isObject(fields) && isObject(fields.time) ? fields.time : {}
      return typeof time.created === "number" && time.created < since
    })
    if (Array.isArray(body) || data.length < activityPageSize || !next || next === cursor || reachedSince) break
    cursor = next
  }
  return messages
}

async function readActivity(sessionIds: string[], since: number) {
  const calls: ActivityCall[] = []
  const errors: { sessionId: string; status: number }[] = []
  let next = 0
  const worker = async () => {
    while (next < sessionIds.length) {
      const sessionId = sessionIds[next++]
      try {
        calls.push(...findActivity(sessionId, await readRecentMessages(encodeURIComponent(sessionId), since), since))
      } catch (error) {
        errors.push({ sessionId, status: error instanceof ReadError ? error.status : 502 })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(maxParallel, sessionIds.length) }, worker))
  return { calls, errors }
}

async function readSessionEvents(sessionId: string, report: SessionReport) {
  const id = encodeURIComponent(sessionId)
  const session = await readOpencode(`/api/session/${id}`, (status) => (report.sessionStatus = status))
  const time = typeof session === "object" && session !== null && "time" in session ? session.time : undefined
  const updated = typeof time === "object" && time !== null && "updated" in time && typeof time.updated === "number" ? time.updated : undefined
  const cached = cache.get(sessionId)
  if (cached && updated !== undefined && cached.updated === updated) {
    report.cached = true
    report.sendEvents = cached.events.length
    return cached.events
  }

  const list = await readAllMessages(id, report)
  const events = findSendEdges(sessionId, list)
  describeMessages(list, report)
  report.sendEvents = events.length
  if (updated !== undefined) cache.set(sessionId, { updated, events })
  return events
}

async function readEdges(sessionIds: string[]) {
  const events: SendEvent[] = []
  const errors: { sessionId: string; status: number }[] = []
  const reports: SessionReport[] = []
  let next = 0
  const worker = async () => {
    while (next < sessionIds.length) {
      const sessionId = sessionIds[next++]
      const report: SessionReport = { sessionId }
      reports.push(report)
      try {
        events.push(...(await readSessionEvents(sessionId, report)))
      } catch (error) {
        errors.push({ sessionId, status: error instanceof ReadError ? error.status : 502 })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(maxParallel, sessionIds.length) }, worker))
  const edges = mergeSendEdges(events)
  writeDebugLine(dataDir, { event: "edges", sessions: reports, edgeCount: edges.length, errors })
  return { edges, errors }
}

const send = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

http
  .createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: "unauthorized" })
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true })
    if (req.method === "GET" && url.pathname === "/edges") {
      const sessionIds = [...new Set((url.searchParams.get("sessions") ?? "").split(",").filter(Boolean))]
      if (sessionIds.length > maxSessions) return send(res, 400, { error: `at most ${maxSessions} sessions` })
      return send(res, 200, await readEdges(sessionIds))
    }
    if (req.method === "GET" && url.pathname === "/activity") {
      const sessionIds = [...new Set((url.searchParams.get("sessions") ?? "").split(",").filter(Boolean))]
      if (sessionIds.length > maxSessions) return send(res, 400, { error: `at most ${maxSessions} sessions` })
      const since = Number(url.searchParams.get("since") ?? 0)
      return send(res, 200, await readActivity(sessionIds, Number.isFinite(since) ? since : 0))
    }
    send(res, 404, { error: "not found" })
  })
  .listen(port, "127.0.0.1")
