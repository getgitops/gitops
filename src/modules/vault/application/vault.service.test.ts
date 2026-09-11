import { beforeEach, describe, expect, it } from 'vitest';
import { VaultService } from './vault.service';

type Json = Record<string, unknown>;

function jsonRow(data: Json) {
  return { toJson: () => data };
}

class FakeVaultRepository {
  environments: Json[] = [];
  folders: Json[] = [];
  secrets: Json[] = [];

  async findEnvironmentBySlug(projectId: string, slug: string) {
    const found = this.environments.find(
      (environment) => environment.projectId === projectId && environment.slug === slug,
    );
    return found ? jsonRow(found) : null;
  }

  async listFolders(projectId: string) {
    return this.folders.filter((folder) => folder.projectId === projectId).map(jsonRow);
  }

  async listSecrets(projectId: string) {
    return this.secrets.filter((secret) => secret.projectId === projectId).map(jsonRow);
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
