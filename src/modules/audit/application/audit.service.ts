import { getGitDb } from '$lib/server/gitdb';
import type { AuditEvent, AuditQueryOptions, AuditQueryResult, EntityRowChange } from '@getgitops/gitdb';

export class AuditService {
  async listEvents(options?: AuditQueryOptions): Promise<AuditQueryResult> {
    const gitdb = getGitDb();
    return gitdb.auditLog(options);
  }

  async getEntityDiff(commitHash: string, entity: string): Promise<EntityRowChange[]> {
    const gitdb = getGitDb();
    return gitdb.entityDiff(commitHash, entity);
  }
}

export type { AuditEvent, AuditQueryOptions, AuditQueryResult, EntityRowChange };
