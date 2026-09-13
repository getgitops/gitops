import { beforeEach, describe, expect, it } from 'vitest';
import { VaultService } from './vault.service';

type Json = Record<string, unknown>;

function jsonRow(data: Json) {
  return { ...data, toJson: () => data };
}

class FakeVaultRepository {
  environments: Json[] = [];
  folders: Json[] = [];
  secrets: Json[] = [];
  settings: Json[] = [];

  async findEnvironmentBySlug(projectId: string, slug: string) {
    const found = this.environments.find(
      (environment) => environment.projectId === projectId && environment.slug === slug,
    );
    return found ? jsonRow(found) : null;
  }

  async listFolders(projectId: string) {
    return this.folders.filter((folder) => folder.projectId === projectId).map(jsonRow);
  }

  async findFolderByPath(projectId: string, path: string) {
    const found = this.folders.find(
      (folder) => folder.projectId === projectId && folder.path === path,
    );
    return found ? jsonRow(found) : null;
  }

  async findFolderById(id: string) {
    const found = this.folders.find((folder) => folder.id === id);
    return found ? jsonRow(found) : null;
  }

  async listSecrets(projectId: string) {
    return this.secrets.filter((secret) => secret.projectId === projectId).map(jsonRow);
  }

  async findSecretById(id: string) {
    const found = this.secrets.find((secret) => secret.id === id);
    return found ? jsonRow(found) : null;
  }

  async findSecretByKey(projectId: string, folderId: string | null, key: string) {
    const found = this.secrets.find(
      (secret) =>
        secret.projectId === projectId &&
        (secret.folderId ?? null) === folderId &&
        secret.key === key,
    );
    return found ? jsonRow(found) : null;
  }

  async createSecret(input: Json) {
    this.secrets.push({ ...input, folderId: input.folderId ?? null });
  }

  async updateSecret(id: string, changes: Json) {
    const secret = this.secrets.find((candidate) => candidate.id === id);
    if (secret) Object.assign(secret, changes);
  }

  async deleteSecret(id: string) {
    this.secrets = this.secrets.filter((secret) => secret.id !== id);
  }

  async findSettingsByProjectId(projectId: string) {
    const found = this.settings.find((setting) => setting.projectId === projectId);
    return found ? jsonRow(found) : null;
  }

  async createSettings(input: Json) {
    this.settings.push(input);
  }
}

describe('VaultService export', () => {
  let repository: FakeVaultRepository;
  let service: VaultService;

  beforeEach(() => {
    repository = new FakeVaultRepository();
    service = new VaultService(repository as never);

    repository.environments.push({ id: 'env-1', projectId: 'p1', slug: 'prod' });
    repository.folders.push({
      id: 'folder-1',
      projectId: 'p1',
      path: '/database',
      parentFolderId: null,
      linkedFolderId: null,
    });
    repository.secrets.push(
      { id: 's1', projectId: 'p1', folderId: null, key: 'ZONE', values: { prod: 'eu' } },
      { id: 's2', projectId: 'p1', folderId: null, key: 'API_KEY', values: { prod: 'abc' } },
      { id: 's3', projectId: 'p1', folderId: null, key: 'ONLY_DEV', values: { dev: 'x' } },
      {
        id: 's4',
        projectId: 'p1',
        folderId: 'folder-1',
        key: 'DB_HOST',
        values: { prod: 'localhost' },
      },
    );
  });

  it('exports root secrets sorted by key in env format', async () => {
    const content = await service.exportEnvFile('p1', 'prod', '/');
    expect(content).toBe('API_KEY=abc\nONLY_DEV=\nZONE=eu');
  });

  it('normalizes alternate root paths when exporting secrets', async () => {
    const content = await service.exportEnvFile('p1', 'prod', '///');
    expect(content).toBe('API_KEY=abc\nONLY_DEV=\nZONE=eu');
  });

  it('exports secrets of a folder path', async () => {
    const content = await service.exportEnvFile('p1', 'prod', '/database');
    expect(content).toBe('DB_HOST=localhost');
  });

  it('exports json format', async () => {
    const content = await service.exportJsonFile('p1', 'prod', '/');
    expect(JSON.parse(content)).toEqual({ API_KEY: 'abc', ONLY_DEV: '', ZONE: 'eu' });
  });

  it('throws when the environment does not exist', async () => {
    await expect(service.exportEnvFile('p1', 'missing', '/')).rejects.toThrow(
      'Environment not found',
    );
  });

  it('throws when the path does not exist', async () => {
    await expect(service.exportJsonFile('p1', 'prod', '/nope')).rejects.toThrow('Folder not found');
  });
});

describe('VaultService secrets', () => {
  let repository: FakeVaultRepository;
  let service: VaultService;

  beforeEach(() => {
    repository = new FakeVaultRepository();
    service = new VaultService(repository as never);
  });

  it('creates a secret with normalized (capitalized) key', async () => {
    const secret = await service.createSecret('p1', { key: 'api key', values: { prod: 'abc' } });
    expect(secret).toMatchObject({ key: 'API_KEY', folderId: null, values: { prod: 'abc' } });
  });

  it('rejects creating a secret in a folder from another project', async () => {
    repository.folders.push({ id: 'folder-1', projectId: 'other', path: '/x' });
    await expect(
      service.createSecret('p1', { folderId: 'folder-1', key: 'X' }),
    ).rejects.toThrow('Folder not found');
  });

  it('finds a secret by key', async () => {
    await service.createSecret('p1', { key: 'zone', values: { prod: 'eu' } });
    const found = await service.findSecretByKey('p1', null, 'zone');
    expect(found).toMatchObject({ key: 'ZONE', values: { prod: 'eu' } });
  });

  it('returns null when a secret key does not exist', async () => {
    await expect(service.findSecretByKey('p1', null, 'missing')).resolves.toBeNull();
  });

  it('updates a secret replacing its values', async () => {
    const created = await service.createSecret('p1', { key: 'zone', values: { prod: 'eu' } });
    const updated = await service.updateSecret('p1', created.id, {
      key: 'zone',
      values: { prod: 'us' },
    });
    expect(updated.values).toEqual({ prod: 'us' });
  });

  it('throws when updating a secret from another project', async () => {
    await repository.createSecret({ id: 's1', projectId: 'other', folderId: null, key: 'X' });
    await expect(
      service.updateSecret('p1', 's1', { key: 'X', values: {} }),
    ).rejects.toThrow('Secret not found');
  });

  it('deletes a secret', async () => {
    const created = await service.createSecret('p1', { key: 'zone' });
    await service.deleteSecret('p1', created.id);
    await expect(service.findSecretByKey('p1', null, 'zone')).resolves.toBeNull();
  });

  it('throws when deleting a secret by key that does not exist', async () => {
    await expect(service.deleteSecretByKey('p1', null, 'missing')).rejects.toThrow(
      'Secret not found',
    );
  });

  it('sets a single environment value while keeping the others and the description', async () => {
    await service.createSecret('p1', {
      key: 'zone',
      description: 'Region',
      values: { prod: 'eu', dev: 'eu-dev' },
    });
    const updated = await service.setSecretValue('p1', null, 'zone', 'prod', 'us');
    expect(updated).toMatchObject({
      description: 'Region',
      values: { prod: 'us', dev: 'eu-dev' },
    });
  });

  it('overrides the description when provided to setSecretValue', async () => {
    await service.createSecret('p1', { key: 'zone', description: 'Region', values: { prod: 'eu' } });
    const updated = await service.setSecretValue('p1', null, 'zone', 'prod', 'us', 'New region');
    expect(updated.description).toBe('New region');
  });

  it('throws when setting the value of a secret that does not exist', async () => {
    await expect(service.setSecretValue('p1', null, 'missing', 'prod', 'us')).rejects.toThrow(
      'Secret not found',
    );
  });
});
