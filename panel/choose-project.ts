import type { GuestProject, GuestSessionsSnapshot } from "@openchamber/sdk";

export type ProjectChoice = { projectId: string; found: boolean };

export function directoryMatches(project: GuestProject, directory: string | null) {
  return (
    directory !== null &&
    (directory === project.directory || directory.startsWith(`${project.directory.replace(/\/$/, "")}/`))
  );
}

/**
 * Picks the project to subscribe to. A snapshot that holds the session wins.
 * Otherwise a project whose directory matches is chosen and the caller waits,
 * because a snapshot (even a "ready" one) can be a partial view of a large project.
 */
export function chooseProject(
  projects: GuestProject[],
  snapshots: Map<string, GuestSessionsSnapshot>,
  sessionId: string,
  directory: string | null,
): ProjectChoice | null {
  for (const project of projects) {
    if (snapshots.get(project.id)?.sessions.some((session) => session.id === sessionId)) {
      return { projectId: project.id, found: true };
    }
  }
  const waiting = projects.find((project) => directoryMatches(project, directory));
  return waiting ? { projectId: waiting.id, found: false } : null;
}
