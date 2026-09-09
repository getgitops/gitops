import crypto from 'crypto';
import { VaultRepository } from '../infrastructure/repositories/vault.repository';
import type { VaultSecretValues } from '../domain/vault.domain';

const DEFAULT_ENVIRONMENTS = [
  { slug: 'dev', name: 'Development' },
  { slug: 'stage', name: 'Stage' },
  { slug: 'prod', name: 'Production' },
];

export type VaultSecretInput = {
  folderId?: string | null;
  key: string;
  description?: string;
  values?: VaultSecretValues;
};

export class VaultService {
  constructor(private readonly repository: VaultRepository) {}

  async getProjectVault(projectId: string) {
    await this.ensureDefaultEnvironments(projectId);
    const [environments, folders, secrets] = await Promise.all([
      this.repository.listEnvironments(projectId),
      this.repository.listFolders(projectId),
      this.repository.listSecrets(projectId),
    ]);

    return {
      environments: environments.map((environment) => environment.toJson()),
      folders: folders.map((folder) => folder.toJson()),
      secrets: secrets.map((secret) => secret.toJson()),
    };
  }

  async listEnvironments(projectId: string) {
    await this.ensureDefaultEnvironments(projectId);
    const environments = await this.repository.listEnvironments(projectId);
    return environments.map((environment) => environment.toJson());
  }

  async createEnvironment(
    projectId: string,
    input: { name: string; slug?: string; description?: string },
  ) {
    const name = this.requireText(input.name, 'El nombre del entorno es obligatorio');
    const slug = this.normalizeSlug(input.slug || name);
    if (!slug) throw new Error('El slug del entorno es obligatorio');

    const existing = await this.repository.findEnvironmentBySlug(projectId, slug);
    if (existing) throw new Error('Ya existe un entorno con ese slug');

    const id = crypto.randomUUID();
    await this.repository.createEnvironment({
      id,
      projectId,
      slug,
      name,
      description: input.description?.trim() || undefined,
    });
    return this.repository.findEnvironmentById(id);
  }

  async updateEnvironment(
    projectId: string,
    id: string,
    changes: { name?: string; slug?: string; description?: string },
  ) {
    const environment = await this.requireProjectEnvironment(projectId, id);
    const patch: { name?: string; slug?: string; description?: string } = {};

    if (changes.name !== undefined) {
      patch.name = this.requireText(changes.name, 'El nombre del entorno es obligatorio');
    }

    if (changes.slug !== undefined) {
      const slug = this.normalizeSlug(changes.slug);
      if (!slug) throw new Error('El slug del entorno es obligatorio');
      const existing = await this.repository.findEnvironmentBySlug(projectId, slug);
      if (existing && existing.id !== environment.id)
        throw new Error('Ya existe un entorno con ese slug');
      patch.slug = slug;
    }

    if (changes.description !== undefined) patch.description = changes.description.trim();

    await this.repository.updateEnvironment(id, patch);
  }

  async deleteEnvironment(projectId: string, id: string) {
    const environment = await this.requireProjectEnvironment(projectId, id);
    const environments = await this.listEnvironments(projectId);
    if (environments.length <= 1) throw new Error('Debe existir al menos un entorno');

    await this.repository.deleteEnvironment(environment.id);
  }

  async createFolder(
    projectId: string,
    input: { parentFolderId?: string | null; name: string; description?: string },
  ) {
    const parentFolder = await this.requireOptionalProjectFolder(projectId, input.parentFolderId);
    const name = this.requireText(input.name, 'El nombre de la carpeta es obligatorio');
    const path = this.buildFolderPath(parentFolder?.path ?? '/', name);

    const existing = await this.repository.findFolderByPath(projectId, path);
    if (existing) throw new Error('Ya existe una carpeta en ese path');

    await this.repository.createFolder({
      id: crypto.randomUUID(),
      projectId,
      parentFolderId: input.parentFolderId || null,
      name,
      path,
      description: input.description?.trim() || undefined,
    });
  }

  async linkFolder(
    projectId: string,
    input: {
      parentFolderId?: string | null;
      linkedFolderId: string;
      name?: string;
      description?: string;
    },
  ) {
    await this.requireOptionalProjectFolder(projectId, input.parentFolderId);
    const linkedFolder = await this.requireProjectFolder(projectId, input.linkedFolderId);
    const name = this.requireText(
      input.name || linkedFolder.name,
      'El alias de la carpeta es obligatorio',
    );
    const parentFolder = await this.requireOptionalProjectFolder(projectId, input.parentFolderId);
    const path = this.buildFolderPath(parentFolder?.path ?? '/', name);

    const existing = await this.repository.findFolderByPath(projectId, path);
    if (existing) throw new Error('Ya existe una carpeta en ese path');

    await this.repository.createFolder({
      id: crypto.randomUUID(),
      projectId,
      parentFolderId: input.parentFolderId || null,
      linkedFolderId: linkedFolder.id,
      name,
      path,
      description: input.description?.trim() || `Link a ${linkedFolder.name}`,
    });
  }

  async getFolderByPath(projectId: string, path: string) {
    if (path === '/') return null;
    const folder = await this.repository.findFolderByPath(projectId, path);
    if (!folder) throw new Error('Folder not found');
    return folder.toJson();
  }

  async createSecret(projectId: string, input: VaultSecretInput) {
    await this.requireOptionalProjectFolder(projectId, input.folderId);
    const key = this.normalizeSecretKey(input.key);
    const values = this.normalizeValues(input.values);

    await this.repository.createSecret({
      id: crypto.randomUUID(),
      projectId,
      folderId: input.folderId || null,
      key,
      description: input.description?.trim() || undefined,
      values,
    });
  }

  async updateSecret(projectId: string, id: string, input: VaultSecretInput) {
    const secret = await this.repository.findSecretById(id);
    if (!secret || secret.projectId !== projectId) throw new Error('Secret not found');
    await this.requireOptionalProjectFolder(projectId, input.folderId);

    await this.repository.updateSecret(id, {
      folderId: input.folderId || null,
      key: this.normalizeSecretKey(input.key),
      description: input.description?.trim(),
      values: this.normalizeValues(input.values),
    });
  }

  private async ensureDefaultEnvironments(projectId: string) {
    const environments = await this.repository.listEnvironments(projectId);
    if (environments.length > 0) return;

    await Promise.all(
      DEFAULT_ENVIRONMENTS.map((environment) =>
        this.repository.createEnvironment({ id: crypto.randomUUID(), projectId, ...environment }),
      ),
    );
  }

  private async requireProjectEnvironment(projectId: string, id: string) {
    const environment = await this.repository.findEnvironmentById(id);
    if (!environment || environment.projectId !== projectId)
      throw new Error('Environment not found');
    return environment;
  }

  private async requireProjectFolder(projectId: string, id: string) {
    const folder = await this.repository.findFolderById(id);
    if (!folder || folder.projectId !== projectId) throw new Error('Folder not found');
    return folder;
  }

  private async requireOptionalProjectFolder(projectId: string, id?: string | null) {
    if (!id) return null;
    return this.requireProjectFolder(projectId, id);
  }

  private requireText(value: string | undefined, message: string) {
    const normalized = value?.trim() ?? '';
    if (!normalized) throw new Error(message);
    return normalized;
  }

  private normalizeSecretKey(value: string) {
    const key = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!key) throw new Error('La key del secreto es obligatoria');
    return key;
  }

  private normalizeSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private buildFolderPath(parentPath: string, name: string) {
    const segment = this.normalizePathSegment(name);
    if (!segment) throw new Error('El path de la carpeta es obligatorio');
    return `${parentPath === '/' ? '' : parentPath}/${segment}`;
  }

  private normalizePathSegment(value: string) {
    return value
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .replace(/\/+/g, '-');
  }

  private normalizeValues(values: VaultSecretValues | undefined): VaultSecretValues {
    return Object.fromEntries(
      Object.entries(values ?? {}).map(([environment, value]) => [
        environment,
        String(value ?? ''),
      ]),
    );
  }
}
