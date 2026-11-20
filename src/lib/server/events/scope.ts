import type { EventScope } from './types';

/** Project lookup used to add the organization to a project-scoped event. */
export type ProjectScopeLookup = {
  getProject(id: string): Promise<{ organization?: { id: string } | null } | null>;
};

/**
 * Scope of an event that happened inside a project. A failed lookup only drops the organization:
 * resolving the scope must never fail the write that already succeeded.
 */
export async function resolveProjectScope(
  projectId: string | null | undefined,
  projects: ProjectScopeLookup | undefined,
): Promise<EventScope> {
  if (!projectId) return { organizationId: null, projectId: null };
  const project = projects ? await projects.getProject(projectId).catch(() => null) : null;
  return { organizationId: project?.organization?.id ?? null, projectId };
}
