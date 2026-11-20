import type { EventBus, EventScope } from '#lib/server/events';
import type { CodeReportEventGitInfo } from '#lib/events/domain-events';
import type { CodeReportGitInfo } from '../domain/code-report-analysis.domain';

/** What the code-report services need from the bus. */
export type CodeReportEventPublisher = Pick<EventBus, 'publish'>;

/** Project lookup used to add the organization to the event scope. */
export type ProjectScopeLookup = {
  getProject(id: string): Promise<{ organization?: { id: string } | null }>;
};

export async function resolveProjectScope(
  projectId: string | null | undefined,
  projects: ProjectScopeLookup | undefined,
): Promise<EventScope> {
  if (!projectId) return { organizationId: null, projectId: null };
  const project = projects ? await projects.getProject(projectId).catch(() => null) : null;
  return { organizationId: project?.organization?.id ?? null, projectId };
}

/** Only the identifying git fields travel in events (no commit messages or author emails). */
export function eventGitInfo(
  gitInfo: CodeReportGitInfo | null | undefined,
): CodeReportEventGitInfo {
  return {
    repositoryUrl: gitInfo?.repositoryUrl ?? null,
    branch: gitInfo?.branch ?? null,
    commit: gitInfo?.commit ?? null,
    version: gitInfo?.version ?? null,
  };
}
