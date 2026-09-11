import { Repository } from '$lib/server/infra/repository';
import {
  VaultEnvironmentEntity,
  VaultFolderEntity,
  VaultSecretEntity,
} from '$lib/database/schemas';
import {
  VaultEnvironmentDomain,
  VaultFolderDomain,
  VaultSecretDomain,
  type VaultSecretValues,
} from '../../domain/vault.domain';

export class VaultRepository extends Repository {
  async listEnvironments(projectId: string): Promise<VaultEnvironmentDomain[]> {
    const result = await this.db
      .select()
      .from(VaultEnvironmentEntity)
      .where({ projectId })
      .orderBy('order', 'asc');
    return result.rows.map((row: any) => new VaultEnvironmentDomain(row));
  }

  async findEnvironmentBySlug(
    projectId: string,
    slug: string,
  ): Promise<VaultEnvironmentDomain | null> {
    const result = await this.db
      .select()
      .from(VaultEnvironmentEntity)
      .where({ projectId, slug })
      .limit(1);
    const row = result.rows[0];
    return row ? new VaultEnvironmentDomain(row) : null;
  }

  async findEnvironmentById(id: string): Promise<VaultEnvironmentDomain | null> {
    const result = await this.db.select().from(VaultEnvironmentEntity).where({ id }).limit(1);
    const row = result.rows[0];
    return row ? new VaultEnvironmentDomain(row) : null;
  }

  async createEnvironment(input: {
    id: string;
    projectId: string;
    slug: string;
    name: string;
    description?: string;
    order?: number;
  }): Promise<void> {
    await this.db.insert(VaultEnvironmentEntity).values({
      ...input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async updateEnvironment(
    id: string,
    changes: { slug?: string; name?: string; description?: string; order?: number },
  ): Promise<void> {
    await this.db
      .update(VaultEnvironmentEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async deleteEnvironment(id: string): Promise<void> {
    await this.db.delete(VaultEnvironmentEntity).where({ id });
  }

  async listFolders(projectId: string): Promise<VaultFolderDomain[]> {
    const result = await this.db
      .select()
      .from(VaultFolderEntity)
      .where({ projectId })
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new VaultFolderDomain(row));
  }

  async findFolderById(id: string): Promise<VaultFolderDomain | null> {
    const result = await this.db.select().from(VaultFolderEntity).where({ id }).limit(1);
    const row = result.rows[0];
    return row ? new VaultFolderDomain(row) : null;
  }

  async findFolderByPath(projectId: string, path: string): Promise<VaultFolderDomain | null> {
    const result = await this.db
      .select()
      .from(VaultFolderEntity)
      .where({ projectId, path })
      .limit(1);
    const row = result.rows[0];
    return row ? new VaultFolderDomain(row) : null;
  }

  async createFolder(input: {
    id: string;
    projectId: string;
    parentFolderId?: string | null;
    linkedFolderId?: string | null;
    name: string;
    path: string;
    description?: string;
  }): Promise<void> {
    await this.db.insert(VaultFolderEntity).values({
      ...input,
      parentFolderId: input.parentFolderId || null,
      linkedFolderId: input.linkedFolderId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteFolder(id: string): Promise<void> {
    await this.db.delete(VaultFolderEntity).where({ id });
  }

  async listSecrets(projectId: string): Promise<VaultSecretDomain[]> {
    const result = await this.db
      .select()
      .from(VaultSecretEntity)
      .where({ projectId })
      .orderBy('createdAt', 'desc');
    return result.rows.map((row: any) => new VaultSecretDomain(row));
  }

  async findSecretById(id: string): Promise<VaultSecretDomain | null> {
    const result = await this.db.select().from(VaultSecretEntity).where({ id }).limit(1);
    const row = result.rows[0];
    return row ? new VaultSecretDomain(row) : null;
  }

  async createSecret(input: {
    id: string;
    projectId: string;
    folderId?: string | null;
    key: string;
    description?: string;
    values: VaultSecretValues;
  }): Promise<void> {
    await this.db.insert(VaultSecretEntity).values({
      ...input,
      folderId: input.folderId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async updateSecret(
    id: string,
    changes: {
      folderId?: string | null;
      key?: string;
      description?: string;
      values?: VaultSecretValues;
    },
  ): Promise<void> {
    await this.db
      .update(VaultSecretEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async deleteSecret(id: string): Promise<void> {
    await this.db.delete(VaultSecretEntity).where({ id });
  }
}
