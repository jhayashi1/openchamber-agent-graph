// service/main.ts
import http from "node:http";

// service/debug.ts
import { appendFileSync, mkdirSync, statSync, truncateSync } from "node:fs";
import { join } from "node:path";
var maxBytes = 1e6;
var isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var keys = (value) => isObject(value) ? Object.keys(value) : undefined;
var typeOf = (value) => Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
function describeBody(body, report) {
  report.bodyType = typeOf(body);
  if (isObject(body))
    report.bodyKeys = Object.keys(body);
}
function describeMessages(messages, report) {
  report.sampleItems = messages.slice(0, 3).map((message) => ({
    keys: keys(message),
    type: isObject(message) && typeof message.type === "string" ? message.type : undefined
  }));
  report.messageCount = messages.length;
  report.sampleMessages = messages.slice(0, 3).map((message) => {
    if (!isObject(message))
      return { keys: undefined };
    const partsField = ["content", "parts"].find((field) => Array.isArray(message[field]));
    return {
      keys: Object.keys(message),
      infoKeys: keys(message.info),
      metadataKeys: keys(message.metadata) ?? (isObject(message.info) ? keys(message.info.metadata) : undefined),
      partsField,
      partCount: partsField ? message[partsField].length : undefined
    };
  });
  const toolParts = [];
  for (const message of messages) {
    if (!isObject(message))
      continue;
    const parts = Array.isArray(message.content) ? message.content : Array.isArray(message.parts) ? message.parts : [];
    for (const part of parts) {
      if (toolParts.length >= 3)
        break;
      if (!isObject(part) || part.type !== "tool")
        continue;
      const name = part.name ?? part.tool;
      toolParts.push({
        keys: Object.keys(part),
        name: typeof name === "string" ? name : typeOf(name),
        stateKeys: keys(part.state),
        metadataKeys: isObject(part.state) ? keys(part.state.metadata) : undefined
      });
    }
  }
  report.sampleToolParts = toolParts;
}
function writeDebugLine(dataDir, line) {
  if (!dataDir)
    return;
  try {
    mkdirSync(dataDir, { recursive: true });
    const file = join(dataDir, "edges-debug.log");
    try {
      if (statSync(file).size > maxBytes)
        truncateSync(file, 0);
    } catch {}
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...isObject(line) ? line : { line } })}
`);
  } catch {}
}

// service/activity-kind.ts
var FILE_TOOLS = new Set(["read", "write", "edit", "multiedit", "patch", "apply_patch", "grep", "glob", "list", "ls", "lsp", "ast_grep_search", "ast_grep_replace"]);
var SHELL_TOOLS = new Set(["bash", "shell", "command", "run_command"]);
var NETWORK_TOOLS = new Set(["webfetch", "websearch", "codesearch", "web_search", "web_fetch"]);
var AGENT_TOOLS = new Set(["task", "subagent", "task_status", "task_cancel", "task_reply", "task_report"]);
var SKILL_TOOLS = new Set(["skill", "search", "tool_search", "marketplace_inspect", "marketplace_manage"]);
var BROWSER_TOOLS = new Set(["openchamber_web"]);
var USER_TOOLS = new Set(["question", "openchamber_secret", "interview_submit_state", "wait_for_user"]);
var FILE_COMMANDS = new Set([
  "cat",
  "head",
  "tail",
  "sed",
  "grep",
  "rg",
  "find",
  "ls",
  "wc",
  "cp",
  "mv",
  "mkdir",
  "touch",
  "diff",
  "cmp",
  "sort",
  "uniq",
  "cut",
  "tr",
  "awk",
  "tee",
  "stat",
  "file",
  "du",
  "tree",
  "ln",
  "basename",
  "dirname",
  "realpath",
  "jq",
  "rm",
  "rmdir"
]);
var NEUTRAL_COMMANDS = new Set(["echo", "printf", "cd", "export", "true", "set", "pwd", "sleep", "which", "test", "["]);
var NETWORK_COMMANDS = new Set(["curl", "wget", "gh", "ssh", "scp", "sftp", "ftp", "rsync", "nc", "ncat", "telnet", "ping", "dig", "nslookup"]);
var NETWORK_SUBCOMMANDS = {
  git: new Set(["push", "pull", "fetch", "clone", "ls-remote"]),
  npm: new Set(["install", "i", "ci", "add", "update", "publish", "view", "audit"]),
  pnpm: new Set(["install", "i", "add", "update", "publish", "dlx"]),
  yarn: new Set(["install", "add", "upgrade", "publish", "dlx"]),
  bun: new Set(["install", "i", "add", "update", "publish"]),
  pip: new Set(["install", "download"]),
  pip3: new Set(["install", "download"]),
  cargo: new Set(["install", "fetch", "publish", "update"]),
  go: new Set(["get", "install"]),
  brew: new Set(["install", "update", "upgrade", "fetch"]),
  docker: new Set(["pull", "push", "login"])
};
var WRAPPERS = {
  sudo: { valueFlags: ["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T"], words: 0 },
  env: { valueFlags: ["-u", "-C", "-S"], words: 0 },
  timeout: { valueFlags: ["-s", "-k", "--signal", "--kill-after"], words: 1 },
  nohup: { valueFlags: [], words: 0 },
  xargs: { valueFlags: ["-I", "-n", "-P", "-d", "-L", "-s", "-E"], words: 0 },
  time: { valueFlags: ["-o", "-f"], words: 0 },
  nice: { valueFlags: ["-n"], words: 0 },
  command: { valueFlags: [], words: 0 },
  exec: { valueFlags: [], words: 0 }
};
var isObject2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function words(segment) {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((word) => word.replace(/^["']|["']$/g, ""));
}
function stripWrappers(tokens) {
  let rest = tokens;
  for (let guard = 0;guard < 8 && rest.length > 0; guard++) {
    const head = rest[0];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(head)) {
      rest = rest.slice(1);
      continue;
    }
    const wrapper = WRAPPERS[head.split("/").pop()];
    if (!wrapper)
      break;
    let index = 1;
    let plain = 0;
    while (index < rest.length) {
      const token = rest[index];
      if (token.startsWith("-"))
        index += wrapper.valueFlags.includes(token) ? 2 : 1;
      else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token))
        index += 1;
      else if (plain < wrapper.words) {
        plain += 1;
        index += 1;
      } else
        break;
    }
    rest = rest.slice(index);
  }
  return rest;
}
function segmentKind(segment) {
  const tokens = stripWrappers(words(segment));
  const first = tokens[0];
  if (!first)
    return "neutral";
  let name = first.split("/").pop();
  let args = tokens.slice(1);
  if ((name === "python" || name === "python3") && args[0] === "-m" && args[1]) {
    name = args[1];
    args = args.slice(2);
  }
  if (NETWORK_COMMANDS.has(name))
    return "network";
  if (name === "npx" || name === "bunx")
    return args.some((arg) => arg === "-y" || arg === "--yes") ? "network" : "shell";
  const subcommands = NETWORK_SUBCOMMANDS[name];
  if (subcommands) {
    const sub = args.find((arg) => !arg.startsWith("-"));
    return sub && subcommands.has(sub) ? "network" : "shell";
  }
  if (name === "find" && args.includes("-delete"))
    return "files";
  if (FILE_COMMANDS.has(name))
    return "files";
  if (NEUTRAL_COMMANDS.has(name))
    return "neutral";
  return "shell";
}
function classifyCommand(command) {
  if (typeof command !== "string" || !command.trim())
    return "shell";
  const kinds = command.split(/&&|\|\||;|\||\n/).map(segmentKind);
  if (kinds.includes("network"))
    return "network";
  if (kinds.includes("shell"))
    return "shell";
  return kinds.includes("files") ? "files" : "shell";
}
function serverOf(name) {
  const [server] = name.split(/[._]/, 1);
  return server ?? name;
}
function classifyTool(rawName, input) {
  if (typeof rawName !== "string" || !rawName)
    return "other";
  const name = rawName.replace(/^tools\./, "").replace(/^tools\["(.*)"\]$/, "$1").toLowerCase();
  if (SHELL_TOOLS.has(name))
    return classifyCommand(isObject2(input) ? input.command ?? input.cmd : undefined);
  if (FILE_TOOLS.has(name))
    return "files";
  if (NETWORK_TOOLS.has(name))
    return "network";
  if (AGENT_TOOLS.has(name))
    return "agents";
  if (SKILL_TOOLS.has(name))
    return "skills";
  if (USER_TOOLS.has(name))
    return "user";
  if (name === "openchamber") {
    const action = isObject2(input) && typeof input.action === "string" ? input.action : "";
    return action.startsWith("session.") ? "agents" : "other";
  }
  if (name === "openchamber_knowledge")
    return "memory";
  if (BROWSER_TOOLS.has(name))
    return "browser";
  if (name.startsWith("openchamber_"))
    return "other";
  if (name === "todowrite" || name === "todoread")
    return "other";
  if (/[._]/.test(name) && serverOf(name) !== name)
    return "mcp";
  return "other";
}

// service/activity.ts
var MAX_CALLS_PER_SESSION = 50;
var isObject3 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var asNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
function statusOf(value) {
  if (value === "completed")
    return "completed";
  if (value === "error" || value === "failed" || value === "denied" || value === "rejected")
    return "error";
  return "running";
}
function callFrom(sessionId, callId, tool, kind, status, fallbackAt, time) {
  const span = isObject3(time) ? time : {};
  const startedAt = asNumber(span.start) ?? asNumber(span.created) ?? fallbackAt;
  const end = asNumber(span.end) ?? asNumber(span.completed);
  const call = { sessionId, callId, tool, kind, status, startedAt };
  if (status !== "running")
    call.endedAt = end ?? startedAt;
  return call;
}
function findActivity(sessionId, messages, since) {
  const calls = [];
  if (!Array.isArray(messages))
    return calls;
  for (const [messageIndex, message] of messages.entries()) {
    if (!isObject3(message))
      continue;
    const fields = isObject3(message.info) ? message.info : message;
    const messageTime = isObject3(fields.time) ? fields.time : {};
    const created = asNumber(messageTime.created) ?? 0;
    const messageId = typeof fields.id === "string" ? fields.id : `m${messageIndex}`;
    const parts = Array.isArray(message.content) ? message.content : Array.isArray(message.parts) ? message.parts : [];
    for (const [partIndex, part] of parts.entries()) {
      if (!isObject3(part))
        continue;
      const name = part.name ?? part.tool;
      if (typeof name !== "string" || !isObject3(part.state))
        continue;
      const state = part.state;
      const callId = String(part.callID ?? part.callId ?? part.id ?? `${messageId}:${partIndex}`);
      const status = statusOf(state.status);
      const inner = name === "execute" && isObject3(state.metadata) && Array.isArray(state.metadata.toolCalls) ? state.metadata.toolCalls : [];
      if (inner.length > 0) {
        for (const [index, call] of inner.entries()) {
          if (!isObject3(call) || typeof call.tool !== "string")
            continue;
          const callStatus = call.status === undefined ? status : statusOf(call.status);
          calls.push(callFrom(sessionId, `${callId}:${index}`, call.tool, classifyTool(call.tool, call.input), callStatus, created, call.time ?? state.time));
        }
        continue;
      }
      calls.push(callFrom(sessionId, callId, name, classifyTool(name, state.input), status, created, state.time));
    }
  }
  return calls.filter((call) => call.startedAt > since || (call.endedAt ?? 0) > since).sort((a, b) => Math.max(b.startedAt, b.endedAt ?? 0) - Math.max(a.startedAt, a.endedAt ?? 0)).slice(0, MAX_CALLS_PER_SESSION);
}

// service/edges.ts
var isObject4 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var asString = (value) => typeof value === "string" && value ? value : undefined;
function sendTarget(input) {
  if (!isObject4(input) || input.action !== "session.send" || !isObject4(input.parameters))
    return;
  return asString(input.parameters.sessionId);
}
function completedSendTargets(part) {
  const state = isObject4(part.state) ? part.state : undefined;
  if (!state)
    return [];
  const name = part.name ?? part.tool;
  if (name === "openchamber") {
    const target = state.status === "completed" ? sendTarget(state.input) : undefined;
    return target ? [target] : [];
  }
  if (name === "execute" && isObject4(state.metadata) && Array.isArray(state.metadata.toolCalls)) {
    return state.metadata.toolCalls.filter(isObject4).filter((call) => call.tool === "openchamber" && call.status === "completed").flatMap((call) => sendTarget(call.input) ?? []);
  }
  return [];
}
function findSendEdges(sessionId, messages) {
  const events = [];
  if (!Array.isArray(messages))
    return events;
  for (const message of messages) {
    if (!isObject4(message))
      continue;
    const fields = isObject4(message.info) ? message.info : message;
    const time = isObject4(fields.time) ? fields.time : {};
    const at = typeof time.created === "number" ? time.created : 0;
    const promptedBy = isObject4(fields.metadata) && isObject4(fields.metadata.openchamber) ? fields.metadata.openchamber.promptedBy : undefined;
    const sender = isObject4(promptedBy) ? asString(promptedBy.sessionID) : undefined;
    if (sender)
      events.push({ from: sender, to: sessionId, at, source: "receiver" });
    const parts = Array.isArray(message.content) ? message.content : Array.isArray(message.parts) ? message.parts : [];
    for (const part of parts) {
      if (!isObject4(part))
        continue;
      for (const to of completedSendTargets(part))
        events.push({ from: sessionId, to, at, source: "sender" });
    }
  }
  return events;
}
function mergeSendEdges(events) {
  const pairs = new Map;
  for (const event of events) {
    const key = JSON.stringify([event.from, event.to]);
    const pair = pairs.get(key) ?? { from: event.from, to: event.to, sender: 0, receiver: 0, lastAt: 0 };
    pair[event.source] += 1;
    pair.lastAt = Math.max(pair.lastAt, event.at);
    pairs.set(key, pair);
  }
  return [...pairs.values()].map(({ from, to, sender, receiver, lastAt }) => ({
    from,
    to,
    count: Math.max(sender, receiver),
    lastAt
  }));
}

// service/main.ts
var port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
var token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
var opencodeUrl = process.env.OPENCHAMBER_OPENCODE_URL ?? "";
if (!port || !token || !opencodeUrl) {
  console.error("OPENCHAMBER_SERVICE_PORT, OPENCHAMBER_SERVICE_TOKEN and OPENCHAMBER_OPENCODE_URL are required");
  process.exit(1);
}
var dataDir = process.env.OPENCHAMBER_SERVICE_DATA_DIR;
writeDebugLine(dataDir, {
  event: "start",
  node: process.version,
  env: Object.fromEntries(["OPENCHAMBER_SERVICE_PORT", "OPENCHAMBER_SERVICE_TOKEN", "OPENCHAMBER_OPENCODE_URL", "OPENCHAMBER_SERVICE_DATA_DIR"].map((name) => [name, Boolean(process.env[name])]))
});
var maxSessions = 200;
var maxParallel = 6;
var pageSize = 200;
var maxPages = 50;
var cache = new Map;

class ReadError extends Error {
  status;
  constructor(status) {
    super(`OpenCode returned ${status}`);
    this.status = status;
  }
}
async function readOpencode(path, onStatus) {
  const response = await fetch(new URL(path, opencodeUrl), { headers: { Authorization: `Bearer ${token}` } });
  onStatus?.(response.status);
  if (!response.ok)
    throw new ReadError(response.status);
  return response.json();
}
var isObject5 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
async function readAllMessages(id, report) {
  const messages = [];
  let cursor;
  let pages = 0;
  while (pages < maxPages) {
    const query = new URLSearchParams({ limit: String(pageSize) });
    if (cursor)
      query.set("cursor", cursor);
    const body = await readOpencode(`/api/session/${id}/message?${query}`, (status) => report.messageStatus = status);
    if (pages === 0)
      describeBody(body, report);
    pages++;
    if (Array.isArray(body)) {
      messages.push(...body);
      break;
    }
    const data = isObject5(body) && Array.isArray(body.data) ? body.data : [];
    messages.push(...data);
    const next = isObject5(body) && isObject5(body.cursor) && typeof body.cursor.next === "string" ? body.cursor.next : undefined;
    if (data.length < pageSize || !next || next === cursor)
      break;
    cursor = next;
  }
  report.pageCount = pages;
  if (pages >= maxPages)
    report.pageCapHit = true;
  return messages;
}
var activityPageSize = 50;
var activityMaxPages = 3;
async function readRecentMessages(id, since) {
  const messages = [];
  let cursor;
  for (let pages = 0;pages < activityMaxPages; pages++) {
    const query = new URLSearchParams({ limit: String(activityPageSize) });
    if (cursor)
      query.set("cursor", cursor);
    const body = await readOpencode(`/api/session/${id}/message?${query}`);
    const data = Array.isArray(body) ? body : isObject5(body) && Array.isArray(body.data) ? body.data : [];
    messages.push(...data);
    const next = isObject5(body) && isObject5(body.cursor) && typeof body.cursor.next === "string" ? body.cursor.next : undefined;
    const reachedSince = data.some((message) => {
      const fields = isObject5(message) && isObject5(message.info) ? message.info : message;
      const time = isObject5(fields) && isObject5(fields.time) ? fields.time : {};
      return typeof time.created === "number" && time.created < since;
    });
    if (Array.isArray(body) || data.length < activityPageSize || !next || next === cursor || reachedSince)
      break;
    cursor = next;
  }
  return messages;
}
async function readActivity(sessionIds, since) {
  const calls = [];
  const errors = [];
  let next = 0;
  const worker = async () => {
    while (next < sessionIds.length) {
      const sessionId = sessionIds[next++];
      try {
        calls.push(...findActivity(sessionId, await readRecentMessages(encodeURIComponent(sessionId), since), since));
      } catch (error) {
        errors.push({ sessionId, status: error instanceof ReadError ? error.status : 502 });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(maxParallel, sessionIds.length) }, worker));
  return { calls, errors };
}
async function readSessionEvents(sessionId, report) {
  const id = encodeURIComponent(sessionId);
  const session = await readOpencode(`/api/session/${id}`, (status) => report.sessionStatus = status);
  const time = typeof session === "object" && session !== null && "time" in session ? session.time : undefined;
  const updated = typeof time === "object" && time !== null && "updated" in time && typeof time.updated === "number" ? time.updated : undefined;
  const cached = cache.get(sessionId);
  if (cached && updated !== undefined && cached.updated === updated) {
    report.cached = true;
    report.sendEvents = cached.events.length;
    return cached.events;
  }
  const list = await readAllMessages(id, report);
  const events = findSendEdges(sessionId, list);
  describeMessages(list, report);
  report.sendEvents = events.length;
  if (updated !== undefined)
    cache.set(sessionId, { updated, events });
  return events;
}
async function readEdges(sessionIds) {
  const events = [];
  const errors = [];
  const reports = [];
  let next = 0;
  const worker = async () => {
    while (next < sessionIds.length) {
      const sessionId = sessionIds[next++];
      const report = { sessionId };
      reports.push(report);
      try {
        events.push(...await readSessionEvents(sessionId, report));
      } catch (error) {
        errors.push({ sessionId, status: error instanceof ReadError ? error.status : 502 });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(maxParallel, sessionIds.length) }, worker));
  const edges = mergeSendEdges(events);
  writeDebugLine(dataDir, { event: "edges", sessions: reports, edgeCount: edges.length, errors });
  return { edges, errors };
}
var send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
http.createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`)
    return send(res, 401, { error: "unauthorized" });
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health")
    return send(res, 200, { ok: true });
  if (req.method === "GET" && url.pathname === "/edges") {
    const sessionIds = [...new Set((url.searchParams.get("sessions") ?? "").split(",").filter(Boolean))];
    if (sessionIds.length > maxSessions)
      return send(res, 400, { error: `at most ${maxSessions} sessions` });
    return send(res, 200, await readEdges(sessionIds));
  }
  if (req.method === "GET" && url.pathname === "/activity") {
    const sessionIds = [...new Set((url.searchParams.get("sessions") ?? "").split(",").filter(Boolean))];
    if (sessionIds.length > maxSessions)
      return send(res, 400, { error: `at most ${maxSessions} sessions` });
    const since = Number(url.searchParams.get("since") ?? 0);
    return send(res, 200, await readActivity(sessionIds, Number.isFinite(since) ? since : 0));
  }
  send(res, 404, { error: "not found" });
}).listen(port, "127.0.0.1");
