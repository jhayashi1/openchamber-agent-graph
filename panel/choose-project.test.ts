import { expect, test } from "bun:test";
import type { GuestProject, GuestSessionsSnapshot } from "@openchamber/sdk";
import { chooseProject } from "./choose-project";

const project = (id: string, directory: string) => ({ id, directory }) as GuestProject;
const snap = (projectId: string, ids: string[], state = "ready", coverageState = "ready") =>
  ({
    kind: "sessions",
    projectId,
    state,
    coverage: [{ directory: "/a", state: coverageState }],
    sessions: ids.map((id) => ({ id })),
  }) as unknown as GuestSessionsSnapshot;

const projects = [project("a", "/a"), project("b", "/b")];

test("found in a snapshot", () => {
  const snaps = new Map([["b", snap("b", ["s"])]]);
  expect(chooseProject(projects, snaps, "s", "/a")).toEqual({ projectId: "b", found: true });
});
test("missing but directory matches waits on that project", () => {
  const snaps = new Map([["a", snap("a", ["x"])]]);
  expect(chooseProject(projects, snaps, "s", "/a/sub")).toEqual({ projectId: "a", found: false });
});
test("no matching directory yields none", () => {
  expect(chooseProject(projects, new Map(), "s", "/c")).toBeNull();
  expect(chooseProject(projects, new Map(), "s", null)).toBeNull();
});
test("incomplete coverage waits", () => {
  const snaps = new Map([["a", snap("a", [], "loading", "loading")]]);
  expect(chooseProject(projects, snaps, "s", "/a")).toEqual({ projectId: "a", found: false });
});
