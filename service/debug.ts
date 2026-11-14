import { appendFileSync, mkdirSync, statSync, truncateSync } from "node:fs"
import { join } from "node:path"

const maxBytes = 1_000_000
type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)
const keys = (value: unknown) => (isObject(value) ? Object.keys(value) : undefined)
const typeOf = (value: unknown) => (Array.isArray(value) ? "array" : value === null ? "null" : typeof value)

export type SessionReport = {
  sessionId: string
  sessionStatus?: number
  messageStatus?: number
  cached?: boolean
  bodyType?: string
  bodyKeys?: string[]
  pageCount?: number
  pageCapHit?: boolean
  sampleItems?: { keys?: string[]; type?: unknown }[]
  messageCount?: number
  sampleMessages?: { keys?: string[]; infoKeys?: string[]; metadataKeys?: string[]; partsField?: string; partCount?: number }[]
  sampleToolParts?: { keys: string[]; name?: unknown; stateKeys?: string[]; metadataKeys?: string[] }[]
  sendEvents?: number
}

// Only structure is described here: key names, types, counts and tool names. Never values.
export function describeBody(body: unknown, report: SessionReport) {
  report.bodyType = typeOf(body)
  if (isObject(body)) report.bodyKeys = Object.keys(body)
}

export function describeMessages(messages: unknown[], report: SessionReport) {
  report.sampleItems = messages.slice(0, 3).map((message) => ({
    keys: keys(message),
    type: isObject(message) && typeof message.type === "string" ? message.type : undefined,
  }))
  report.messageCount = messages.length
  report.sampleMessages = messages.slice(0, 3).map((message) => {
    if (!isObject(message)) return { keys: undefined }
    const partsField = ["content", "parts"].find((field) => Array.isArray(message[field]))
    return {
      keys: Object.keys(message),
      infoKeys: keys(message.info),
      metadataKeys: keys(message.metadata) ?? (isObject(message.info) ? keys(message.info.metadata) : undefined),
      partsField,
      partCount: partsField ? (message[partsField] as unknown[]).length : undefined,
    }
  })
  const toolParts: SessionReport["sampleToolParts"] = []
  for (const message of messages) {
    if (!isObject(message)) continue
    const parts = Array.isArray(message.content) ? message.content : Array.isArray(message.parts) ? message.parts : []
    for (const part of parts) {
      if (toolParts.length >= 3) break
      if (!isObject(part) || part.type !== "tool") continue
      const name = part.name ?? part.tool
      toolParts.push({
        keys: Object.keys(part),
        name: typeof name === "string" ? name : typeOf(name),
        stateKeys: keys(part.state),
        metadataKeys: isObject(part.state) ? keys(part.state.metadata) : undefined,
      })
    }
  }
  report.sampleToolParts = toolParts
}

export function writeDebugLine(dataDir: string | undefined, line: unknown) {
  if (!dataDir) return
  try {
    mkdirSync(dataDir, { recursive: true })
    const file = join(dataDir, "edges-debug.log")
    try {
      if (statSync(file).size > maxBytes) truncateSync(file, 0)
    } catch {}
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...(isObject(line) ? line : { line }) })}\n`)
  } catch {}
}
