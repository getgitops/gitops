import type { EventBus } from '#lib/server/events';
export { resolveProjectScope, type ProjectScopeLookup } from '#lib/server/events/scope';
import type { CodeReportEventGitInfo } from '#lib/events/domain-events';
import type { CodeReportGitInfo } from '../domain/code-report-analysis.domain';

/** What the code-report services need from the bus. */
export type CodeReportEventPublisher = Pick<EventBus, 'publish'>;

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
