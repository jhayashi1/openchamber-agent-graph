export const ACTIVITY_KINDS = ["files", "shell", "network", "mcp", "browser", "agents", "skills", "memory", "user", "other"] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

const FILE_TOOLS = new Set(["read", "write", "edit", "multiedit", "patch", "apply_patch", "grep", "glob", "list", "ls", "lsp", "ast_grep_search", "ast_grep_replace"])
const SHELL_TOOLS = new Set(["bash", "shell", "command", "run_command"])
const NETWORK_TOOLS = new Set(["webfetch", "websearch", "codesearch", "web_search", "web_fetch"])
const AGENT_TOOLS = new Set(["task", "subagent", "task_status", "task_cancel", "task_reply", "task_report"])
const SKILL_TOOLS = new Set(["skill", "search", "tool_search", "marketplace_inspect", "marketplace_manage"])
/** Built-in browser tools. MCP servers are never named here: every MCP call is mcp, whatever the server. */
const BROWSER_TOOLS = new Set(["openchamber_web"])
const USER_TOOLS = new Set(["question", "openchamber_secret", "interview_submit_state", "wait_for_user"])

const FILE_COMMANDS = new Set([
  "cat", "head", "tail", "sed", "grep", "rg", "find", "ls", "wc", "cp", "mv", "mkdir", "touch", "diff", "cmp", "sort",
  "uniq", "cut", "tr", "awk", "tee", "stat", "file", "du", "tree", "ln", "basename", "dirname", "realpath", "jq", "rm", "rmdir",
])
const NEUTRAL_COMMANDS = new Set(["echo", "printf", "cd", "export", "true", "set", "pwd", "sleep", "which", "test", "["])
const NETWORK_COMMANDS = new Set(["curl", "wget", "gh", "ssh", "scp", "sftp", "ftp", "rsync", "nc", "ncat", "telnet", "ping", "dig", "nslookup"])
const NETWORK_SUBCOMMANDS: Record<string, ReadonlySet<string>> = {
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
  docker: new Set(["pull", "push", "login"]),
}

/** Wrappers run another command. Each lists the flags that take a value and how many plain words belong to the wrapper. */
const WRAPPERS: Record<string, { valueFlags: readonly string[]; words: number }> = {
  sudo: { valueFlags: ["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T"], words: 0 },
  env: { valueFlags: ["-u", "-C", "-S"], words: 0 },
  timeout: { valueFlags: ["-s", "-k", "--signal", "--kill-after"], words: 1 },
  nohup: { valueFlags: [], words: 0 },
  xargs: { valueFlags: ["-I", "-n", "-P", "-d", "-L", "-s", "-E"], words: 0 },
  time: { valueFlags: ["-o", "-f"], words: 0 },
  nice: { valueFlags: ["-n"], words: 0 },
  command: { valueFlags: [], words: 0 },
  exec: { valueFlags: [], words: 0 },
}

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

function words(segment: string): string[] {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((word) => word.replace(/^["']|["']$/g, ""))
}

/** Drops assignments and wrapper commands so that the command that really runs comes first. */
function stripWrappers(tokens: string[]): string[] {
  let rest = tokens
  for (let guard = 0; guard < 8 && rest.length > 0; guard++) {
    const head = rest[0]!
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(head)) {
      rest = rest.slice(1)
      continue
    }
    const wrapper = WRAPPERS[head.split("/").pop()!]
    if (!wrapper) break
    let index = 1
    let plain = 0
    while (index < rest.length) {
      const token = rest[index]!
      if (token.startsWith("-")) index += wrapper.valueFlags.includes(token) ? 2 : 1
      else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) index += 1
      else if (plain < wrapper.words) {
        plain += 1
        index += 1
      } else break
    }
    rest = rest.slice(index)
  }
  return rest
}

function segmentKind(segment: string): "network" | "files" | "neutral" | "shell" {
  const tokens = stripWrappers(words(segment))
  const first = tokens[0]
  if (!first) return "neutral"
  let name = first.split("/").pop()!
  let args = tokens.slice(1)
  if ((name === "python" || name === "python3") && args[0] === "-m" && args[1]) {
    name = args[1]
    args = args.slice(2)
  }
  if (NETWORK_COMMANDS.has(name)) return "network"
  if (name === "npx" || name === "bunx") return args.some((arg) => arg === "-y" || arg === "--yes") ? "network" : "shell"
  const subcommands = NETWORK_SUBCOMMANDS[name]
  if (subcommands) {
    const sub = args.find((arg) => !arg.startsWith("-"))
    return sub && subcommands.has(sub) ? "network" : "shell"
  }
  if (name === "find" && args.includes("-delete")) return "files"
  if (FILE_COMMANDS.has(name)) return "files"
  if (NEUTRAL_COMMANDS.has(name)) return "neutral"
  return "shell"
}

export function classifyCommand(command: unknown): ActivityKind {
  if (typeof command !== "string" || !command.trim()) return "shell"
  const kinds = command.split(/&&|\|\||;|\||\n/).map(segmentKind)
  if (kinds.includes("network")) return "network"
  if (kinds.includes("shell")) return "shell"
  return kinds.includes("files") ? "files" : "shell"
}

/** `server_tool` or `server.tool`: the part before the first separator. */
function serverOf(name: string) {
  const [server] = name.split(/[._]/, 1)
  return server ?? name
}

export function classifyTool(rawName: unknown, input?: unknown): ActivityKind {
  if (typeof rawName !== "string" || !rawName) return "other"
  const name = rawName.replace(/^tools\./, "").replace(/^tools\["(.*)"\]$/, "$1").toLowerCase()
  if (SHELL_TOOLS.has(name)) return classifyCommand(isObject(input) ? (input.command ?? input.cmd) : undefined)
  if (FILE_TOOLS.has(name)) return "files"
  if (NETWORK_TOOLS.has(name)) return "network"
  if (AGENT_TOOLS.has(name)) return "agents"
  if (SKILL_TOOLS.has(name)) return "skills"
  if (USER_TOOLS.has(name)) return "user"
  if (name === "openchamber") {
    const action = isObject(input) && typeof input.action === "string" ? input.action : ""
    return action.startsWith("session.") ? "agents" : "other"
  }
  if (name === "openchamber_knowledge") return "memory"
  if (BROWSER_TOOLS.has(name)) return "browser"
  if (name.startsWith("openchamber_")) return "other"
  if (name === "todowrite" || name === "todoread") return "other"
  if (/[._]/.test(name) && serverOf(name) !== name) return "mcp"
  return "other"
}
