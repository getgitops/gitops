import { getGitDb, getRepositoryWebUrl } from '$lib/server/gitdb';
import type { AuditEvent, EntityRowChange } from '@getgitops/gitdb';

export type AuditListOptions = {
  search?: string;
  organizationId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
};

export type AuditListResult = {
  events: AuditEvent[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

export class AuditService {
  /** Only real insert/update/delete events with a resolved entity are audit-worthy; drop the rest. */
  async listEvents(options: AuditListOptions = {}): Promise<AuditListResult> {
    const gitdb = getGitDb();
    const { search, organizationId, dateFrom, dateTo } = options;
    const { events } = await gitdb.auditLog({ search, organizationId, dateFrom, dateTo });
    const filtered = events.filter((event) => event.action !== 'other' && event.entity !== null);

    const perPage = Math.min(Math.max(Math.trunc(options.perPage ?? DEFAULT_PER_PAGE), 1), MAX_PER_PAGE);
    const total = filtered.length;
    const totalPages = Math.max(Math.ceil(total / perPage), 1);
    const page = Math.min(Math.max(Math.trunc(options.page ?? 1), 1), totalPages);

    const start = (page - 1) * perPage;
    const pageEvents = filtered.slice(start, start + perPage);

    return { events: pageEvents, total, page, perPage, totalPages };
  }

  async getEntityDiff(commitHash: string, entity: string): Promise<EntityRowChange[]> {
    const gitdb = getGitDb();
    return gitdb.entityDiff(commitHash, entity);
  }

  getRepositoryWebUrl(): string | null {
    return getRepositoryWebUrl();
  }
}

export type { AuditEvent, EntityRowChange };
