import { getGitDb, getRepositoryWebUrl } from '$lib/server/gitdb';
import type { AuditEvent, AuditQueryOptions, AuditQueryResult, EntityRowChange } from '@getgitops/gitdb';

export class AuditService {
  /** Only real insert/update/delete events with a resolved entity are audit-worthy; drop the rest. */
  async listEvents(options?: AuditQueryOptions): Promise<AuditQueryResult> {
    const gitdb = getGitDb();
    const { events } = await gitdb.auditLog(options);
    const filtered = events.filter((event) => event.action !== 'other' && event.entity !== null);
    return { events: filtered, total: filtered.length };
  }

  async getEntityDiff(commitHash: string, entity: string): Promise<EntityRowChange[]> {
    const gitdb = getGitDb();
    return gitdb.entityDiff(commitHash, entity);
  }

  getRepositoryWebUrl(): string | null {
    return getRepositoryWebUrl();
  }
}

export type { AuditEvent, AuditQueryOptions, AuditQueryResult, EntityRowChange };
