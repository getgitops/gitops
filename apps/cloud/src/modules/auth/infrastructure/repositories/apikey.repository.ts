import { Repository } from './repository';
import { ApiKeyEntity } from '$lib/database/schemas';
import type { ApiKeyView } from '../../domain/entities';

type ApiKeyRow = {
  id: string;
  userId: string | null;
  projectId: string | null;
  roleId: string | null;
  createdByUserId: string | null;
  name: string;
  keyPrefix: string;
  keyHash: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export class ApiKeyRepository extends Repository {
  async listByUser(userId: string): Promise<ApiKeyView[]> {
    const result = await this.db
      .select()
      .from(ApiKeyEntity)
      .where({ userId })
      .orderBy('createdAt', 'desc');

    return (result.rows as ApiKeyRow[])
      .filter((row) => !row.projectId)
      .map((row) => this.toJSON(row));
  }

  async findById(userId: string, keyId: string): Promise<ApiKeyView | null> {
    const result = await this.db.select().from(ApiKeyEntity).where({ id: keyId, userId }).limit(1);
    const row = result.rows[0] as ApiKeyRow | undefined;

    if (!row) {
      return null;
    }

    return this.toJSON(row);
  }

  async findByIdAny(keyId: string): Promise<ApiKeyView | null> {
    const result = await this.db.select().from(ApiKeyEntity).where({ id: keyId }).limit(1);
    const row = result.rows[0] as ApiKeyRow | undefined;

    if (!row) {
      return null;
    }

    return this.toJSON(row);
  }

  async listByProject(projectId: string): Promise<ApiKeyView[]> {
    const result = await this.db
      .select()
      .from(ApiKeyEntity)
      .where({ projectId })
      .orderBy('createdAt', 'desc');

    return (result.rows as ApiKeyRow[]).map((row) => this.toJSON(row));
  }

  async findValidByHash(keyHash: string): Promise<ApiKeyView | null> {
    const result = await this.db.select().from(ApiKeyEntity).where({ keyHash }).limit(1);
    const row = result.rows[0] as ApiKeyRow | undefined;

    if (!row || row.revokedAt) {
      return null;
    }

    if (row.expiresAt && row.expiresAt <= new Date().toISOString()) {
      return null;
    }

    return this.toJSON(row);
  }

  async create(input: {
    id: string;
    userId: string | null;
    projectId: string | null;
    roleId: string | null;
    createdByUserId: string | null;
    name: string;
    keyPrefix: string;
    keyHash: string;
    expiresAt: string | null;
  }): Promise<void> {
    await this.db.insert(ApiKeyEntity).values({
      id: input.id,
      userId: input.userId,
      projectId: input.projectId,
      roleId: input.roleId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      keyPrefix: input.keyPrefix,
      keyHash: input.keyHash,
      expiresAt: input.expiresAt,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    });
  }

  async revoke(userId: string, keyId: string): Promise<void> {
    await this.db
      .update(ApiKeyEntity)
      .set({ revokedAt: new Date().toISOString() })
      .where({ id: keyId, userId });
  }

  async revokeAny(keyId: string): Promise<void> {
    await this.db
      .update(ApiKeyEntity)
      .set({ revokedAt: new Date().toISOString() })
      .where({ id: keyId });
  }

  async touchLastUsed(keyId: string): Promise<void> {
    await this.db
      .update(ApiKeyEntity)
      .set({ lastUsedAt: new Date().toISOString() })
      .where({ id: keyId });
  }

  async updateKeyMaterial(
    keyId: string,
    input: {
      keyPrefix: string;
      keyHash: string;
      expiresAt: string | null;
    },
  ): Promise<void> {
    await this.db
      .update(ApiKeyEntity)
      .set({
        keyPrefix: input.keyPrefix,
        keyHash: input.keyHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        lastUsedAt: null,
      })
      .where({ id: keyId });
  }

  protected override toJSON(row: ApiKeyRow): ApiKeyView {
    return {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix.slice(0, 6),
      userId: row.userId ?? null,
      projectId: row.projectId ?? null,
      roleId: row.roleId ?? null,
      createdByUserId: row.createdByUserId ?? null,
      expiresAt: row.expiresAt,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    };
  }
}
