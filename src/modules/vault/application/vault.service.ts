import crypto from 'crypto';
import { VaultRepository } from '../infrastructure/repositories/vault.repository';
import {
  eventBus,
  VaultEnvironmentCreatedEvent,
  VaultEnvironmentDeletedEvent,
  VaultEnvironmentUpdatedEvent,
} from '$modules/events';
import type { VaultEncryptionProvider, VaultSecretValues } from '../domain/vault.domain';

const DEFAULT_ENVIRONMENTS = [
  { slug: 'dev', name: 'Development' },
  { slug: 'stage', name: 'Stage' },
  { slug: 'prod', name: 'Production' },
];

export const VAULT_ENCRYPTION_PROVIDERS: { value: VaultEncryptionProvider; label: string }[] = [
  { value: 'gitops_kms', label: 'GitOps KMS' },
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

    const environments = await this.repository.listEnvironments(projectId);
    const nextOrder =
      environments.reduce((max, environment) => Math.max(max, environment.order), -1) + 1;

    const id = crypto.randomUUID();
    await this.repository.createEnvironment({
      id,
      projectId,
      slug,
      name,
      description: input.description?.trim() || undefined,
      order: nextOrder,
    });

    await eventBus.emit(
      new VaultEnvironmentCreatedEvent({ projectId, environmentId: id, name, slug }),
    );

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

    await eventBus.emit(
      new VaultEnvironmentUpdatedEvent({
        projectId,
        environmentId: environment.id,
        slug: patch.slug ?? environment.slug,
        changes: patch,
      }),
    );
  }

  async deleteEnvironment(projectId: string, id: string) {
    const environment = await this.requireProjectEnvironment(projectId, id);
    const environments = await this.listEnvironments(projectId);
    if (environments.length <= 1) throw new Error('Debe existir al menos un entorno');

    await this.repository.deleteEnvironment(environment.id);

    await eventBus.emit(
      new VaultEnvironmentDeletedEvent({
        projectId,
        environmentId: environment.id,
        name: environment.name,
        slug: environment.slug,
      }),
    );
  }

  async moveEnvironment(projectId: string, id: string, direction: 'up' | 'down') {
    const environments = (await this.repository.listEnvironments(projectId)).sort(
      (a, b) => a.order - b.order,
    );
    const index = environments.findIndex((environment) => environment.id === id);
    if (index === -1) throw new Error('Environment not found');

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= environments.length) return;

    const current = environments[index];
    const target = environments[targetIndex];

    await this.repository.updateEnvironment(current.id, { order: target.order });
    await this.repository.updateEnvironment(target.id, { order: current.order });
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
    const normalizedPath = this.normalizeFolderPath(path);
    if (normalizedPath === '/') return null;
    const folder = await this.repository.findFolderByPath(projectId, normalizedPath);
    if (!folder) throw new Error('Folder not found');
    return folder.toJson();
  }

  async deleteFolder(projectId: string, id: string) {
    const folder = await this.requireProjectFolder(projectId, id);

    const [folders, secrets] = await Promise.all([
      this.repository.listFolders(projectId),
      this.repository.listSecrets(projectId),
    ]);

    if (folders.some((candidate) => candidate.parentFolderId === folder.id)) {
      throw new Error('La carpeta tiene subcarpetas, borralas primero');
    }
    if (folders.some((candidate) => candidate.linkedFolderId === folder.id)) {
      throw new Error('La carpeta esta enlazada desde otra carpeta');
    }
    if (secrets.some((secret) => secret.folderId === folder.id)) {
      throw new Error('La carpeta tiene secretos, borralos primero');
    }

    await this.repository.deleteFolder(folder.id);
  }

  async exportSecrets(projectId: string, environmentSlug: string, path = '/') {
    const environment = await this.repository.findEnvironmentBySlug(projectId, environmentSlug);
    if (!environment) throw new Error('Environment not found');

    const targetFolder = await this.getFolderByPath(projectId, path);
    const folders = (await this.repository.listFolders(projectId)).map((folder) => folder.toJson());

    const scope = this.collectExportFolderIds(targetFolder?.id ?? null, folders);
    const secrets = (await this.repository.listSecrets(projectId)).map((secret) => secret.toJson());

    return secrets
      .filter((secret) => scope.has(secret.folderId ?? null))
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((secret) => [secret.key, secret.values?.[environmentSlug] ?? ''] as const);
  }

  async exportEnvFile(projectId: string, environmentSlug: string, path = '/') {
    const entries = await this.exportSecrets(projectId, environmentSlug, path);
    return entries.map(([key, value]) => `${key}=${value}`).join('\n');
  }

  async exportJsonFile(projectId: string, environmentSlug: string, path = '/') {
    const entries = await this.exportSecrets(projectId, environmentSlug, path);
    return JSON.stringify(Object.fromEntries(entries), null, 2);
  }

  // Un export incluye los secretos del path y los de las carpetas enlazadas desde el, no el resto del arbol.
  private collectExportFolderIds(
    folderId: string | null,
    folders: Array<{ id: string; parentFolderId: string | null; linkedFolderId: string | null }>,
    scope = new Set<string | null>(),
  ) {
    if (scope.has(folderId)) return scope;
    scope.add(folderId);

    const folder = folderId ? folders.find((candidate) => candidate.id === folderId) : null;
    if (folder?.linkedFolderId) this.collectExportFolderIds(folder.linkedFolderId, folders, scope);

    for (const child of folders.filter((candidate) => candidate.parentFolderId === folderId)) {
      if (child.linkedFolderId) this.collectExportFolderIds(child.linkedFolderId, folders, scope);
    }

    return scope;
  }

  private normalizeFolderPath(path: string) {
    const segments = path.split('/').filter(Boolean);
    return segments.length === 0 ? '/' : `/${segments.join('/')}`;
  }

  async importEnvFile(
    projectId: string,
    environmentSlug: string,
    folderId: string | null,
    content: string,
  ) {
    const environment = await this.repository.findEnvironmentBySlug(projectId, environmentSlug);
    if (!environment) throw new Error('Environment not found');
    await this.requireOptionalProjectFolder(projectId, folderId);

    const entries = this.parseEnvContent(content);
    if (entries.length === 0) throw new Error('No se encontraron secretos validos');

    const capitalize = (await this.getSettings(projectId)).capitalizeSecrets;
    const secrets = (await this.repository.listSecrets(projectId)).map((secret) => secret.toJson());
    let created = 0;
    let updated = 0;

    for (const [key, value] of entries) {
      const normalizedKey = this.normalizeSecretKey(key, capitalize);
      const existing = secrets.find(
        (secret) =>
          (secret.folderId ?? null) === (folderId ?? null) && secret.key === normalizedKey,
      );

      if (existing) {
        await this.repository.updateSecret(existing.id, {
          values: { ...existing.values, [environmentSlug]: value },
        });
        updated += 1;
        continue;
      }

      await this.createSecret(projectId, {
        folderId,
        key: normalizedKey,
        values: { [environmentSlug]: value },
      });
      created += 1;
    }

    return { created, updated };
  }

  async copyEnvironmentValues(
    projectId: string,
    sourceSlug: string,
    targetSlug: string,
    folderId: string | null,
  ) {
    if (sourceSlug === targetSlug) throw new Error('Selecciona un entorno distinto');

    const [source, target] = await Promise.all([
      this.repository.findEnvironmentBySlug(projectId, sourceSlug),
      this.repository.findEnvironmentBySlug(projectId, targetSlug),
    ]);
    if (!source || !target) throw new Error('Environment not found');
    await this.requireOptionalProjectFolder(projectId, folderId);

    const secrets = (await this.repository.listSecrets(projectId)).map((secret) => secret.toJson());
    let copied = 0;

    for (const secret of secrets) {
      if ((secret.folderId ?? null) !== (folderId ?? null)) continue;
      const value = secret.values?.[sourceSlug];
      if (value === undefined) continue;

      await this.repository.updateSecret(secret.id, {
        values: { ...secret.values, [targetSlug]: value },
      });
      copied += 1;
    }

    return { copied };
  }

  private parseEnvContent(content: string) {
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        const key = line
          .slice(0, separatorIndex)
          .trim()
          .replace(/^export\s+/, '');
        const value = line
          .slice(separatorIndex + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '');
        return [key, value] as const;
      })
      .filter(([key]) => key.length > 0);
  }

  async createSecret(projectId: string, input: VaultSecretInput) {
    await this.requireOptionalProjectFolder(projectId, input.folderId);
    const capitalize = (await this.getSettings(projectId)).capitalizeSecrets;
    const key = this.normalizeSecretKey(input.key, capitalize);
    const values = this.normalizeValues(input.values);

    const id = crypto.randomUUID();
    await this.repository.createSecret({
      id,
      projectId,
      folderId: input.folderId || null,
      key,
      description: input.description?.trim() || undefined,
      values,
    });
    return (await this.repository.findSecretById(id))!.toJson();
  }

  async updateSecret(projectId: string, id: string, input: VaultSecretInput) {
    const secret = await this.repository.findSecretById(id);
    if (!secret || secret.projectId !== projectId) throw new Error('Secret not found');
    await this.requireOptionalProjectFolder(projectId, input.folderId);
    const capitalize = (await this.getSettings(projectId)).capitalizeSecrets;

    await this.repository.updateSecret(id, {
      folderId: input.folderId || null,
      key: this.normalizeSecretKey(input.key, capitalize),
      description: input.description?.trim(),
      values: this.normalizeValues(input.values),
    });
    return (await this.repository.findSecretById(id))!.toJson();
  }

  async deleteSecret(projectId: string, id: string) {
    const secret = await this.repository.findSecretById(id);
    if (!secret || secret.projectId !== projectId) throw new Error('Secret not found');

    await this.repository.deleteSecret(id);
  }

  async findSecretByKey(projectId: string, folderId: string | null, key: string) {
    const capitalize = (await this.getSettings(projectId)).capitalizeSecrets;
    const secret = await this.repository.findSecretByKey(
      projectId,
      folderId,
      this.normalizeSecretKey(key, capitalize),
    );
    return secret?.toJson() ?? null;
  }

  async setSecretValue(
    projectId: string,
    folderId: string | null,
    key: string,
    environment: string,
    value: string,
    description?: string,
  ) {
    const secret = await this.findSecretByKey(projectId, folderId, key);
    if (!secret) throw new Error('Secret not found');

    return this.updateSecret(projectId, secret.id, {
      folderId,
      key,
      description: description !== undefined ? description : secret.description ?? undefined,
      values: { ...secret.values, [environment]: value },
    });
  }

  async deleteSecretByKey(projectId: string, folderId: string | null, key: string) {
    const secret = await this.findSecretByKey(projectId, folderId, key);
    if (!secret) throw new Error('Secret not found');
    await this.deleteSecret(projectId, secret.id);
  }

  async getSettings(projectId: string) {
    const existing = await this.repository.findSettingsByProjectId(projectId);
    if (existing) return existing.toJson();

    const id = crypto.randomUUID();
    await this.repository.createSettings({
      id,
      projectId,
      capitalizeSecrets: true,
      encryptionProvider: 'gitops_kms',
    });
    return (await this.repository.findSettingsByProjectId(projectId))!.toJson();
  }

  async updateSettings(
    projectId: string,
    changes: { capitalizeSecrets?: boolean; encryptionProvider?: VaultEncryptionProvider },
  ) {
    const settings = await this.getSettings(projectId);
    await this.repository.updateSettings(settings.id, changes);
    return this.getSettings(projectId);
  }

  private async ensureDefaultEnvironments(projectId: string) {
    const environments = await this.repository.listEnvironments(projectId);
    if (environments.length > 0) return;

    for (const [index, environment] of DEFAULT_ENVIRONMENTS.entries()) {
      await this.repository.createEnvironment({
        id: crypto.randomUUID(),
        projectId,
        order: index,
        ...environment,
      });
    }
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

  private normalizeSecretKey(value: string, capitalize: boolean) {
    const trimmed = value.trim();
    const sanitized = capitalize ? trimmed.toUpperCase() : trimmed;
    const key = sanitized.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
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
