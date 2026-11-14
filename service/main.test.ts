import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { spawn, type ChildProcess } from "node:child_process"
import http from "node:http"
import type { AddressInfo } from "node:net"

const sendInput = { action: "session.send", parameters: { sessionId: "ses_b", prompt: "Q" } }
const messages: Record<string, unknown[]> = {
  ses_a: [{ type: "assistant", id: "msg_1", time: { created: 10 }, content: [{ type: "tool", name: "openchamber", state: { status: "completed", input: sendInput } }] }],
  ses_b: [{ time: { created: 11 }, metadata: { openchamber: { promptedBy: { sessionID: "ses_a" } } }, text: "Q" }],
}

const toolPart = (callID: string, start: number) => ({ type: "tool", name: "bash", callID, state: { status: "completed", input: { command: "curl SECRET" }, output: "SECRET", time: { start, end: start + 1 } } })
messages.ses_act = [
  { id: "m_old", time: { created: 5 }, content: [toolPart("old", 5)] },
  { id: "m_new", time: { created: 100 }, content: [toolPart("new", 100)] },
]

const fillers = Array.from({ length: 200 }, (_, index) => ({ type: "user", id: `msg_f${index}`, time: { created: index }, text: "filler" }))
const pagedMessages = [...fillers, ...messages.ses_a]
messages.ses_paged = pagedMessages
const plainArray = new Set(["ses_b"])

let stub: http.Server
let service: ChildProcess
let base = ""
const auth = { Authorization: "Bearer secret" }

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = http.createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })

beforeAll(async () => {
  stub = http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://stub")
    const match = /^\/api\/session\/([^/]+)(\/message)?$/.exec(requestUrl.pathname)
    const id = match?.[1] ?? ""
    if (req.headers.authorization !== "Bearer secret" || !(id in messages)) {
      res.writeHead(id ? 404 : 403).end("{}")
      return
    }
    res.writeHead(200, { "Content-Type": "application/json" })
    if (!match?.[2]) return void res.end(JSON.stringify({ id, time: { updated: 1 } }))
    if (plainArray.has(id)) return void res.end(JSON.stringify(messages[id]))
    const limit = Number(requestUrl.searchParams.get("limit"))
    const start = Number(requestUrl.searchParams.get("cursor") ?? 0)
    const data = messages[id].slice(start, start + limit)
    res.end(JSON.stringify({ data, cursor: data.length ? { previous: String(start), next: String(start + data.length) } : {} }))
  })
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve))
  const port = await freePort()
  base = `http://127.0.0.1:${port}`
  service = spawn("node", ["service/main.js"], {
    env: {
      ...process.env,
      OPENCHAMBER_SERVICE_PORT: String(port),
      OPENCHAMBER_SERVICE_TOKEN: "secret",
      OPENCHAMBER_OPENCODE_URL: `http://127.0.0.1:${(stub.address() as AddressInfo).port}`,
    },
    stdio: "ignore",
  })
  for (let attempt = 0; attempt < 50; attempt++) {
    const ready = await fetch(`${base}/health`, { headers: auth }).then((r) => r.ok, () => false)
    if (ready) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
})

afterAll(() => {
  service.kill()
  stub.close()
})

test("rejects a request without the bearer", async () => {
  expect((await fetch(`${base}/health`)).status).toBe(401)
})

test("answers /health and 404", async () => {
  expect((await fetch(`${base}/health`, { headers: auth })).status).toBe(200)
  expect((await fetch(`${base}/nope`, { headers: auth })).status).toBe(404)
})

test("returns merged edges and skipped sessions", async () => {
  const response = await fetch(`${base}/edges?sessions=ses_a,ses_b,ses_gone`, { headers: auth })
  expect(await response.json()).toEqual({
    edges: [{ from: "ses_a", to: "ses_b", count: 1, lastAt: 11 }],
    errors: [{ sessionId: "ses_gone", status: 404 }],
  })
})

test("returns recent tool calls without input or output", async () => {
  const response = await fetch(`${base}/activity?sessions=ses_act,ses_gone&since=50`, { headers: auth })
  const text = await response.text()
  expect(text).not.toContain("SECRET")
  expect(JSON.parse(text)).toEqual({
    calls: [{ sessionId: "ses_act", callId: "new", tool: "bash", kind: "network", status: "completed", startedAt: 100, endedAt: 101 }],
    errors: [{ sessionId: "ses_gone", status: 404 }],
  })
})

test("follows the cursor across pages", async () => {
  const response = await fetch(`${base}/edges?sessions=ses_paged`, { headers: auth })
  expect(await response.json()).toEqual({ edges: [{ from: "ses_paged", to: "ses_b", count: 1, lastAt: 10 }], errors: [] })
})

test("writes a structure log without prompt text", async () => {
  const dir = mkdtempSync(join(tmpdir(), "edges-debug-"))
  const port = await freePort()
  const child = spawn("node", ["service/main.js"], {
    env: {
      ...process.env,
      OPENCHAMBER_SERVICE_PORT: String(port),
      OPENCHAMBER_SERVICE_TOKEN: "secret",
      OPENCHAMBER_OPENCODE_URL: `http://127.0.0.1:${(stub.address() as AddressInfo).port}`,
      OPENCHAMBER_SERVICE_DATA_DIR: dir,
    },
    stdio: "ignore",
  })
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await fetch(`http://127.0.0.1:${port}/health`, { headers: auth }).then((r) => r.ok, () => false)) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await fetch(`http://127.0.0.1:${port}/edges?sessions=ses_a,ses_paged`, { headers: auth })
    const log = readFileSync(join(dir, "edges-debug.log"), "utf8")
    console.log(log)
    expect(log).toContain('"event":"edges"')
    expect(log).toContain('"messageCount":1')
    expect(log).toContain('"pageCount":2')
    expect(log).toContain('"sampleItems"')
    expect(log).not.toContain('"Q"')
    expect(log).not.toContain("filler")
    expect(log).not.toContain("secret")
  } finally {
    child.kill()
  }
})
