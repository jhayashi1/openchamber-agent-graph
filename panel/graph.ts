import type { GuestSessionRecord } from "@openchamber/sdk";

export type AgentGraphNode = {
  id: string;
  label: string;
  title: string;
  agent: string | undefined;
  activity: GuestSessionRecord["activity"];
  outcome: GuestSessionRecord["outcome"];
  depth: number;
  isCurrent: boolean;
  isRoot: boolean;
  createdAt: number;
};

export type MessageEdge = { from: string; to: string; count: number; lastAt: number };

export type AgentGraphEdge =
  | { from: string; to: string; kind: "dispatch" }
  | { from: string; to: string; kind: "message"; count: number; lastAt: number };

export type AgentGraph = {
  rootId: string;
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
};

export function buildAgentGraph(
  sessions: readonly GuestSessionRecord[],
  currentSessionId: string,
  messageEdges: readonly MessageEdge[] = [],
): AgentGraph | null {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const current = byId.get(currentSessionId);
  if (!current) return null;

  const ancestorIds = new Set([current.id]);
  let root = current;
  for (
    let parent = root.parentId === null ? undefined : byId.get(root.parentId);
    parent && !ancestorIds.has(parent.id);
    parent = root.parentId === null ? undefined : byId.get(root.parentId)
  ) {
    ancestorIds.add(parent.id);
    root = parent;
  }

  const childrenByParent = new Map<string, GuestSessionRecord[]>();
  for (const session of sessions) {
    if (session.parentId === null) continue;
    if (session.archivedAt !== null && !ancestorIds.has(session.id)) continue;
    const siblings = childrenByParent.get(session.parentId) ?? [];
    siblings.push(session);
    childrenByParent.set(session.parentId, siblings);
  }

  const nodes: AgentGraphNode[] = [];
  const edges: AgentGraphEdge[] = [];
  const visited = new Set([root.id]);
  const queue = [{ session: root, depth: 0 }];
  for (const { session, depth } of queue) {
    nodes.push(toNode(session, depth));
    const children = [...(childrenByParent.get(session.id) ?? [])].sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      edges.push({ from: session.id, to: child.id, kind: "dispatch" });
      queue.push({ session: child, depth: depth + 1 });
    }
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const { from, to, count, lastAt } of messageEdges) {
    if (from === to) continue;
    const partner = nodeById.get(from) ?? nodeById.get(to);
    const outsider = nodeById.has(from) ? to : from;
    if (!nodeById.has(from) && !nodeById.has(to)) continue;
    if (!nodeById.has(outsider)) {
      const session = byId.get(outsider);
      if (!session || session.archivedAt !== null || !partner) continue;
      const extra = toNode(session, partner.depth + 1);
      nodes.push(extra);
      nodeById.set(extra.id, extra);
    }
    edges.push({ from, to, kind: "message", count, lastAt });
  }

  return { rootId: root.id, nodes, edges };

  function toNode(session: GuestSessionRecord, depth: number): AgentGraphNode {
    return {
      id: session.id,
      label: session.agent ?? "agent",
      title: session.title,
      agent: session.agent,
      activity: session.activity,
      outcome: session.outcome,
      depth,
      isCurrent: session.id === currentSessionId,
      isRoot: session.id === root.id,
      createdAt: session.createdAt,
    };
  }
}

const OLDEST_OPACITY = 0.35;

export function recencyOpacity(nodes: AgentGraphNode[]): Map<string, number> {
  const distinctTimes = [...new Set(nodes.map((node) => node.createdAt))].sort((a, b) => b - a);
  const steps = distinctTimes.length - 1;
  return new Map(
    nodes.map((node) => {
      const rank = distinctTimes.indexOf(node.createdAt);
      return [node.id, steps === 0 ? 1 : 1 - (1 - OLDEST_OPACITY) * (rank / steps)];
    }),
  );
}
