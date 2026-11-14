import { expect, test } from "bun:test"
import { classifyCommand, classifyTool } from "./activity-kind"

const bash = (command: string) => classifyTool("bash", { command })

const tools: [string, unknown, string][] = [
  ["read", {}, "files"],
  ["write", {}, "files"],
  ["edit", {}, "files"],
  ["grep", {}, "files"],
  ["glob", {}, "files"],
  ["webfetch", {}, "network"],
  ["websearch", {}, "network"],
  ["task", {}, "agents"],
  ["subagent", {}, "agents"],
  ["task_status", {}, "agents"],
  ["skill", {}, "skills"],
  ["question", {}, "user"],
  ["todowrite", {}, "other"],
  ["ast_grep_search", {}, "files"],
  ["ast_grep_replace", {}, "files"],
  ["interview_submit_state", {}, "user"],
  ["wait_for_user", {}, "user"],
  ["openchamber", { action: "session.send" }, "agents"],
  ["openchamber", { action: "project.list" }, "other"],
  ["openchamber_knowledge", {}, "memory"],
  ["openchamber_web", {}, "browser"],
  ["openchamber_render", {}, "other"],
  ["playwright_browser_click", {}, "mcp"],
  ["chrome-devtools_list_pages", {}, "mcp"],
  ["atlassian_confluence_delete_page", {}, "mcp"],
  ["atlassian_confluence_get_page", {}, "mcp"],
  ["context7_resolve-library-id", {}, "mcp"],
  ["grep_app_searchGitHub", {}, "mcp"],
  ["gh_grep_searchGitHub", {}, "mcp"],
  ["devportal_list-scaffolder-actions", {}, "mcp"],
  ["tools.atlassian.confluence_get_page", {}, "mcp"],
  ["tools[\"gh_grep\"].searchGitHub", {}, "mcp"],
  ["websearch_web_search_exa", {}, "mcp"],
  ["web_fetch_exa", {}, "mcp"],
  ["openchamber_web", {}, "browser"],
  ["any-server_get_page", {}, "mcp"],
  ["apply_patch", {}, "files"],
  ["todoread", {}, "other"],
  ["marketplace_inspect", {}, "skills"],
  ["openchamber_knowledge", {}, "memory"],
  ["openchamber_knowledge", {}, "memory"],
  ["tools.context7", {}, "other"],
  ["mystery", {}, "other"],
  [undefined as unknown as string, {}, "other"],
]
test.each(tools)("tool %s -> %s", (name, input, kind) => {
  expect(classifyTool(name, input)).toBe(kind as never)
})

const commands: [string, string][] = [
  ["cat a.txt", "files"],
  ["grep -r foo src | wc -l", "files"],
  ["mv a b", "files"],
  ["find . -name x -delete", "files"],
  ["sed -i s/a/b/ f", "files"],
  ["sudo rm -rf build", "files"],
  ["env FOO=1 cat x", "files"],
  ["FOO=1 curl https://x", "network"],
  ["timeout 30 curl https://x", "network"],
  ["nohup ssh host", "network"],
  ["ls | xargs rsync -a . host:", "network"],
  ["git push origin main", "network"],
  ["git status", "shell"],
  ["git commit -m x && git push", "network"],
  ["npm install left-pad", "network"],
  ["bun run build", "shell"],
  ["bun install", "network"],
  ["docker pull alpine", "network"],
  ["docker ps", "shell"],
  ["npx -y create-thing", "network"],
  ["npx tsc", "shell"],
  ["python3 -m pip install x", "network"],
  ["echo hi", "shell"],
  ["cd x && ls", "files"],
  ["make test", "shell"],
  ["/usr/bin/curl -s x", "network"],
]
test.each(commands)("bash %s -> %s", (command, kind) => {
  expect(bash(command)).toBe(kind as never)
})

test("empty command is shell", () => {
  expect(classifyCommand("")).toBe("shell")
  expect(classifyTool("shell", { command: "gh pr list" })).toBe("network")
})

test("every MCP server is mcp, whatever its name", () => {
  for (const name of ["notes_search", "memory_recall", "wiki_get_page", "playwright_browser_click", "websearch_web_search_exa", "my-server.do_thing", "tools.custom.tool"]) {
    expect(classifyTool(name)).toBe("mcp")
  }
})
