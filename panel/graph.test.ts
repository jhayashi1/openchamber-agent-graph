import { describe, expect, test } from "bun:test";
import type { GuestSessionRecord } from "@openchamber/sdk";
import { buildAgentGraph } from "./graph";

function session(
  id: string,
  overrides: Partial<GuestSessionRecord> = {},
): GuestSessionRecord {
  return {
    id,
    title: `title ${id}`,
    projectId: "p",
    directory: "/d",
    agent: "build",
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
    archivedAt: null,
    worktree: null,
    activity: "idle",
    outcome: null,
    items: [],
    ...overrides,
  };
}

const ids = (graph: NonNullable<ReturnType<typeof buildAgentGraph>>) =>
  graph.nodes.map((node) => node.id);

describe("buildAgentGraph", () => {
  test("returns null when the current session is not listed", () => {
    expect(buildAgentGraph([session("a")], "missing")).toBeNull();
  });

  test("single session", () => {
    const graph = buildAgentGraph([session("a")], "a")!;
    expect(graph.rootId).toBe("a");
    expect(graph.edges).toEqual([]);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({
      id: "a",
      isRoot: true,
      isCurrent: true,
      depth: 0,
      title: "title a",
      activity: "idle",
      outcome: null,
    });
  });

  test("current subagent resolves the top ancestor and includes siblings and cousins", () => {
    const graph = buildAgentGraph(
      [
        session("root"),
        session("a", { parentId: "root", createdAt: 1 }),
        session("b", { parentId: "root", createdAt: 2 }),
        session("a1", { parentId: "a", createdAt: 3 }),
        session("b1", { parentId: "b", createdAt: 4 }),
      ],
      "a1",
    )!;
    expect(graph.rootId).toBe("root");
    expect(ids(graph)).toEqual(["root", "a", "b", "a1", "b1"]);
    expect(graph.nodes.find((n) => n.id === "a1")).toMatchObject({
      isCurrent: true,
      isRoot: false,
      depth: 2,
    });
    expect(graph.edges).toContainEqual({ from: "a", to: "a1", kind: "dispatch" });
    expect(graph.edges).toHaveLength(4);
  });

  test("excludes unrelated roots", () => {
    const graph = buildAgentGraph(
      [session("root"), session("other"), session("otherChild", { parentId: "other" })],
      "root",
    )!;
    expect(ids(graph)).toEqual(["root"]);
  });

  test("missing parent makes the highest found session the root", () => {
    const graph = buildAgentGraph(
      [session("mid", { parentId: "gone" }), session("leaf", { parentId: "mid" })],
      "leaf",
    )!;
    expect(graph.rootId).toBe("mid");
    expect(graph.nodes.find((n) => n.id === "mid")!.isRoot).toBe(true);
    expect(ids(graph)).toEqual(["mid", "leaf"]);
  });

  test("parentId cycle terminates", () => {
    const graph = buildAgentGraph(
      [session("a", { parentId: "b" }), session("b", { parentId: "a" })],
      "a",
    )!;
    expect(ids(graph).sort()).toEqual(["a", "b"]);
    expect(graph.edges).toHaveLength(1);
  });

  test("excludes archived sibling subtrees but keeps archived ancestors", () => {
    const graph = buildAgentGraph(
      [
        session("root"),
        session("archivedAncestor", { parentId: "root", archivedAt: 5, createdAt: 1 }),
        session("current", { parentId: "archivedAncestor", createdAt: 2 }),
        session("archivedSibling", { parentId: "root", archivedAt: 5, createdAt: 3 }),
        session("hiddenChild", { parentId: "archivedSibling", createdAt: 4 }),
      ],
      "current",
    )!;
    expect(ids(graph)).toEqual(["root", "archivedAncestor", "current"]);
  });

  test("orders children by createdAt", () => {
    const graph = buildAgentGraph(
      [
        session("root"),
        session("late", { parentId: "root", createdAt: 30 }),
        session("early", { parentId: "root", createdAt: 10 }),
        session("middle", { parentId: "root", createdAt: 20 }),
      ],
      "root",
    )!;
    expect(ids(graph)).toEqual(["root", "early", "middle", "late"]);
    expect(graph.edges.map((e) => e.to)).toEqual(["early", "middle", "late"]);
  });

  test("label falls back to agent when the agent is absent", () => {
    const graph = buildAgentGraph(
      [session("a", { agent: undefined }), session("b", { parentId: "a", agent: "explore" })],
      "a",
    )!;
    expect(graph.nodes.map((n) => n.label)).toEqual(["agent", "explore"]);
  });

  describe("message edges", () => {
    const tree = [session("root"), session("a", { parentId: "root" }), session("b", { parentId: "root" })];
    const message = (from: string, to: string) => ({ from, to, count: 2, lastAt: 5 });

    test("adds a message edge between two tree nodes without changing the tree", () => {
      const plain = buildAgentGraph(tree, "a")!;
      const graph = buildAgentGraph(tree, "a", [message("a", "b")])!;
      expect(graph.rootId).toBe(plain.rootId);
      expect(graph.nodes).toEqual(plain.nodes);
      expect(graph.edges).toEqual([
        ...plain.edges,
        { from: "a", to: "b", kind: "message", count: 2, lastAt: 5 },
      ]);
    });

    test("adds an outside session as an extra node one level deeper", () => {
      const outside = session("out", { title: "Outside" });
      const graph = buildAgentGraph([...tree, outside], "a", [message("out", "b")])!;
      const extra = graph.nodes.find((n) => n.id === "out")!;
      expect(extra).toMatchObject({ depth: 2, isRoot: false, isCurrent: false });
      expect(graph.rootId).toBe("root");
      expect(graph.nodes.find((n) => n.id === "b")!.depth).toBe(1);
      expect(graph.edges).toContainEqual({ from: "out", to: "b", kind: "message", count: 2, lastAt: 5 });
    });

    test("skips unknown, archived, self and unconnected edges", () => {
      const archived = session("old", { archivedAt: 1 });
      const other = session("x");
      const graph = buildAgentGraph([...tree, archived, other], "a", [
        message("a", "missing"),
        message("a", "old"),
        message("a", "a"),
        message("x", "y"),
      ])!;
      expect(ids(graph)).toEqual(["root", "a", "b"]);
      expect(graph.edges.filter((e) => e.kind === "message")).toEqual([]);
    });

    test("one extra node is added once for several edges", () => {
      const graph = buildAgentGraph([...tree, session("out")], "a", [message("out", "a"), message("b", "out")])!;
      expect(ids(graph).filter((id) => id === "out")).toHaveLength(1);
      expect(graph.edges.filter((e) => e.kind === "message")).toHaveLength(2);
    });
  });
});
