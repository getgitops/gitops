import { SlackWorkspaceEntity } from '#lib/database/schemas';
import { Repository } from '#lib/server/infra/repository';
import {
  DEFAULT_CHANNEL_LOCALE,
  isChannelLocale,
} from '#lib/server/infra/notifications/chat-types';
import type { SlackWorkspace } from '../../domain/slack-workspace.domain';

export interface SlackWorkspaceRepositoryPort {
  findByTeamId(teamId: string): Promise<SlackWorkspace | null>;
  listByOrganization(organizationId: string): Promise<SlackWorkspace[]>;
  insert(workspace: SlackWorkspace): Promise<void>;
  update(
    id: string,
    changes: Partial<
      Pick<SlackWorkspace, 'teamName' | 'botToken' | 'locale' | 'installedByUserId'>
    >,
  ): Promise<void>;
  delete(id: string): Promise<void>;
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

function toWorkspace(row: Record<string, any>): SlackWorkspace {
  return {
    id: row.id,
    teamId: row.teamId,
    teamName: row.teamName,
    organizationId: row.organizationId,
    botToken: row.botToken,
    locale: isChannelLocale(row.locale) ? row.locale : DEFAULT_CHANNEL_LOCALE,
    installedByUserId: row.installedByUserId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export class SlackWorkspaceRepository extends Repository implements SlackWorkspaceRepositoryPort {
  async findByTeamId(teamId: string) {
    const result = await this.db.select().from(SlackWorkspaceEntity).where({ teamId }).limit(1);
    return result.rows[0] ? toWorkspace(result.rows[0]) : null;
  }

  async listByOrganization(organizationId: string) {
    const result = await this.db.select().from(SlackWorkspaceEntity).where({ organizationId });
    return result.rows.map(toWorkspace);
  }

  async insert(workspace: SlackWorkspace) {
    await this.db.insert(SlackWorkspaceEntity).values({ ...workspace });
  }

  async update(id: string, changes: Parameters<SlackWorkspaceRepositoryPort['update']>[1]) {
    await this.db
      .update(SlackWorkspaceEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async delete(id: string) {
    await this.db.delete(SlackWorkspaceEntity).where({ id });
  }
}

/** In-memory fake for unit tests. */
export class InMemorySlackWorkspaceRepository implements SlackWorkspaceRepositoryPort {
  rows = new Map<string, SlackWorkspace>();

  async findByTeamId(teamId: string) {
    const row = [...this.rows.values()].find((item) => item.teamId === teamId);
    return row ? structuredClone(row) : null;
  }

  async listByOrganization(organizationId: string) {
    return [...this.rows.values()]
      .filter((item) => item.organizationId === organizationId)
      .map((item) => structuredClone(item));
  }

  async insert(workspace: SlackWorkspace) {
    this.rows.set(workspace.id, structuredClone(workspace));
  }

  async update(id: string, changes: Parameters<SlackWorkspaceRepositoryPort['update']>[1]) {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, ...changes, updatedAt: new Date().toISOString() });
  }

  async delete(id: string) {
    this.rows.delete(id);
  }
}
