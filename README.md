# Agent Graph

An OpenChamber extension. It adds a panel to the right-hand menu that draws the agents of the current chat as a graph.

## Tool pulses

When an agent runs a tool, a small icon pops out of its node when the call starts: it grows with a slight overshoot, drifts outward and fades in about 0.8 seconds. A smaller, fainter icon pops out when the call ends. A failed or refused call shows its icon in red, with a short red flash on the node. The icons use the theme text colour, not a colour per kind. Calls that start together on one node show as up to three icons fanned out and a count such as `x5`. With reduced motion on, the icon does not fly: it shows still next to the node for a moment, then fades.

Icons by kind of tool:

- files (document): read, write, edit, grep, glob, and shell commands that only touch files (`cat`, `mv`, `rm`, `sed`, `find -delete`)
- shell (terminal prompt): other shell commands
- network (globe): the built-in web fetch and search tools, and shell commands that reach the network (`curl`, `gh`, `ssh`, `rsync`, `git push`, `npm install`, `docker pull`, `npx -y`)
- mcp (plug): every MCP server tool, whatever the server, named `<server>_<tool>` (also inside `execute` as `tools.<server>.<tool>`). The map does not depend on which MCP servers you have configured.
- browser (window): the OpenChamber web panel (browser MCP servers such as Playwright count as mcp)
- agents (robot): subagents, tasks and `session.send`
- skills (lightning bolt): skills and tool search
- memory (bookmark): OpenChamber project knowledge (notes, todos, plans)
- user (speech bubble): questions to you
- other (three dots): everything else

Commands behind `sudo`, `env`, `timeout`, `nohup` and `xargs` count as the command they run. The panel asks the extension's service for `/activity` about every 2.5 seconds, only while the panel is visible and an agent is running or waiting (or had a tool call in the last 30 seconds). Turn the feature off with Settings, Nodes, Tool pulses. A legend of the icons shows under the graph legend while it is on.

Privacy: only tool names, kinds, status and times leave OpenCode. The service never returns the input or output of a tool call (no commands, file paths or text). Nothing is stored.

## Focus view

The idea comes from the lot-map project (MIT); the code is our own.

Click a node to see one agent at close range. The focus view replaces the graph area. The graph keeps its nodes, positions, camera and animations, and comes back as it was. Use the back arrow ("Back to graph") or Escape to return; the node gets the keyboard focus again. The header shows the title, the agent type and the activity of the session, and an Open chat button that opens the session in the chat.

- The agent is the hub in the centre, in its node colour. Ten stations stand on a ring around it, with the same kinds and icons as tool pulses: user at the top, then files, shell, network, mcp, browser, agents, skills, memory and other, clockwise.
- Each station shows the icon of its kind. Each tool call sends a small icon from the hub to its station when it starts and back when it ends. The spoke lights up toward the station and the circle gives a soft ripple. A failed call sends a red icon, a red ripple and a short shake. When nothing happens, the hub glows slowly and the dashed ring turns very slowly. The circles and spokes use neutral theme colours.
- Spokes are always thin. A spoke grows brighter the more calls its station has had. The icon sits in the centre of a thin circle. The number after the station name is its call count.
- `x3` at a station means three calls run there at the same time.
- A red dot with a number stays on a station for each failed call, as long as the focus view is open. Closing and opening the view starts again from the recent history.
- A station with a running call gets a thin dashed outline that turns slowly (one turn in 24 seconds). It starts with the call and stops when no call runs. It does not show how long the call has run.
- The Agents station shows the same turning dashed outline as a running call while a subagent that this agent dispatched is running or waiting. An `x3` badge shows the number when 2 or more are working.
- The feed under the map lists the last 16 actions, newest first: running (...), done (check) or failed (cross), the kind icon, the tool name and its age. Calls in a row at one station fold into one row with `+N`.

When the view opens, the panel asks the service for the last 50 calls of that session so that the spokes and the feed are not empty. While the view is open, the panel asks again every 2.5 seconds for that session, also when the agent is idle, and stops when the view closes. With reduced motion on, the icons, the idle glow and the dashed outline do not move (a busy station keeps a stronger solid outline and a still dashed outline); a call only fades a ring around the station. This view uses the same `/activity` data as tool pulses, so it shows only tool names, kinds, statuses and times.

## What it shows

- The graph is an infinite space. Each node is one agent session. Each edge means a parent session dispatched a subagent session.
- The first view fits all nodes and centres them. The fit icon in the header or a double-click on the background fits them again.
- Drag a node to move it; its neighbours follow and the graph settles when you let go. Drag the background to pan. Use the wheel or a two-finger pinch to zoom.
- Dragged nodes stay where you drop them.
- Drag a node to move it. A short click on a node, or Enter or Space on a focused node, opens the focus view for that agent (see Focus view). The Open chat button in the focus view opens the session.
- Each node is a plain circle. Each session has its own colour. The colour stays the same for that session.
- The current session has a slightly larger circle.
- A light beam moves along each edge from the parent to the child. It shows the direction of the dispatch. After each beam reaches the child, the edge waits a random pause before the next beam. The first beam of an edge (when the panel opens, when the edge appears, or when you turn beams on) waits a random 2 seconds up to the pause maximum, so beams show soon but do not all start together. By default the pause grows with the number of agents: 2 to 5 seconds with 2 agents, up to 20 to 30 seconds with 20 or more agents, in a straight line between. You can turn the beams off, or set the pause range by hand, in the settings. It stops when your system asks for reduced motion.
- Running agents pulse with a ping in their own colour. With reduced motion, they show a soft static glow instead.
- Nodes waiting for your answer or permission breathe slowly with a warning-coloured glow.
- Labels show the session title with the agent type below it. They appear when you zoom in. Hover a node to see its label at any zoom.
- Newer sessions are brighter. Older sessions fade. A legend in the bottom-left corner shows this.
- The status is in the tooltip and in the running count in the header.

## Requirements

- OpenChamber 2.6.0 or newer, web or desktop.

## Install

1. Open Settings -> Extensions.
2. Paste the absolute path of this folder.
3. Approve the "sessions" permission.

## Develop

```sh
bun install
bun run build
```

Reload the extension in OpenChamber after each build. `panel/main.js` is committed, so run `bun run build` before you commit.

## Preview

```sh
bun run preview
```

Open `dev/preview.html` in a browser. It shows fixture data and has a light and dark toggle. Add `?focus=general-1` to open the focus view with fake history and live fake calls (`&focusLive=still` for no live calls). It needs no OpenChamber host.

## Tests

```sh
bun test
bun run typecheck
bun run check
```

## Limitations

- The panel cannot read message content. Edges show only dispatch (`parentId`) links. They do not show prompts or message counts.
- Sessions that OpenChamber's session tool starts without a `parentId` are not linked.
- A later version could add a local service with `provides: ["opencode"]`. It could read `/api/session/:id/message` to draw richer edges.

## Message edges

A local service (`service/main.js`) finds sessions that send messages to each other with OpenChamber's `session.send` tool. It reads each session's messages through OpenChamber's OpenCode proxy and looks for completed `session.send` calls (sender side) and for the `promptedBy` marker on received messages (receiver side). A send seen from both sides counts once.

OpenChamber asks you to approve this extension reading your conversations. The service only reads: it never sends, edits or deletes anything, and it keeps no data on disk.

The panel draws each pair as a dashed, curved cyan edge (drawn at 25% opacity) next to the solid dispatch edges. Its beam runs from the sender to the receiver, and its tooltip shows the sender, the receiver, the number of messages and the time of the last one. A session that is in the same project but outside the agent tree appears as an extra node when it exchanges messages with a node in the tree. Message edges are weaker than dispatch edges in the layout, so the tree keeps its shape.

The panel asks the service again when the set of agents or one agent's update time changes (at most once every 3 seconds), and every 15 seconds while an agent runs or waits. When you have not approved the service, or it is not running, the panel shows the dispatch graph and a muted "messages off" note in the header. Hover over the note to see why.

Build it with `bun run build:service` (part of `bun run build`). The bundle runs on plain Node.

## Live physics

The graph layout is a live force simulation (d3-force, with Barnes-Hut repulsion), like the graph view in Obsidian. It opens already settled, then keeps adjusting with cooling when sessions change or when you change a force. It sleeps when it is settled, so it uses no CPU. With reduced motion, it settles at once without animation.

## Settings

The gear icon in the panel header opens a settings popover. Changes apply at once and are saved with extension storage, so they are the same on every device that uses the same OpenChamber instance.

The settings sections (Nodes, Beams, Subagent edges, Physics) fold open and closed, start closed, and remember which ones you left open.

- Nodes: colour palette (Vivid, Pastel, Muted, Neon, Ocean, Sunset, Forest or Monochrome). Each session keeps its colour position from its ID in every palette. Switches for the pulse on running agents, the glow on waiting agents, and the fade of older sessions.
- Beams: "Show beams" switch (off stops all beams; on again starts each edge with a fresh random pause), colour (theme or custom), length, travel time, "Auto pause by graph size" (on by default; the Pause min and Pause max sliders are disabled and show the current automatic range), manual pause min and max (used when auto is off, default 5 to 10 seconds), width, glow.
- Subagent edges: colour (theme or custom) and opacity of the message edges.
- Physics: center force, hub pull (extra centring for nodes with many edges; 0 turns it off), repel force, link force and link distance for the live physics.

"Reset to defaults" restores the original look.

## Package as a zip

`bun run pack` builds and checks the extension, then writes `dist/agent-graph-<version>.zip`. The zip holds only the files that OpenChamber runs: `package.json`, `README.md`, `panel/index.html`, `panel/main.js` and `service/main.js`. To install it, go to Settings -> Extensions -> Add and choose the zip. OpenChamber copies a zip into its data folder, so after a change you must pack and install it again. Increase `version` in `package.json` for each new zip.
