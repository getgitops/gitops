import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeysService } from './apikeys.service';
import type { ApiKeyView } from '../domain/entities';

function createRepositoryMock(): any {
  return {
    listByUser: vi.fn(),
    listByProject: vi.fn(),
    findValidByHash: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAny: vi.fn(),
    revoke: vi.fn(),
    revokeAny: vi.fn(),
    touchLastUsed: vi.fn(),
    updateKeyMaterial: vi.fn(),
  };
}

describe('ApiKeysService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists keys through the repository', async () => {
    const repository = createRepositoryMock();
    const keys: ApiKeyView[] = [
      {
        id: 'key-1',
        name: 'Deploy',
        keyPrefix: 'gvs_12',
        projectId: null,
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: '2026-08-18T00:00:00.000Z',
      },
    ];

    repository.listByUser.mockImplementation(async () => keys);

    const service = new ApiKeysService(repository);

    await expect(service.listActiveApiKeys('user-1')).resolves.toEqual(keys);
    expect(repository.listByUser).toHaveBeenCalledWith('user-1');
  });

  it('validates an active api key token', async () => {
    const repository = createRepositoryMock();
    repository.findValidByHash.mockImplementation(async () => ({
      id: 'key-1',
      name: 'Deploy',
      keyPrefix: 'gvs_12',
      projectId: null,
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: '2026-08-18T00:00:00.000Z',
    }));

    const service = new ApiKeysService(repository);

    await expect(service.validateApiKey('gvs_121212')).resolves.toBe(true);
    expect(repository.findValidByHash).toHaveBeenCalledWith(expect.any(String));
  });

  it('rejects empty api key tokens', async () => {
    const repository = createRepositoryMock();
    const service = new ApiKeysService(repository);

    await expect(service.validateApiKey('   ')).resolves.toBe(false);
    expect(repository.findValidByHash).not.toHaveBeenCalled();
  });

  it('returns false when the token does not map to an active key', async () => {
    const repository = createRepositoryMock();
    repository.findValidByHash.mockImplementation(async () => null);

    const service = new ApiKeysService(repository);

    await expect(service.validateApiKey('gvs_missing')).resolves.toBe(false);
    expect(repository.findValidByHash).toHaveBeenCalledWith(expect.any(String));
  });

  it('creates a key with a capped prefix and hashed token', async () => {
    const repository = createRepositoryMock();
    const service = new ApiKeysService(repository);

    const result = await service.createApiKey('user-1', 'Deploy', '2026-12-31T00:00:00.000Z');

    expect(result.token.startsWith('gvs_')).toBe(true);
    expect(result.key).toMatchObject({
      id: expect.any(String),
      name: 'Deploy',
      keyPrefix: result.token.slice(0, 6),
      expiresAt: '2026-12-31T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
    });

    expect(repository.create).toHaveBeenCalledWith({
      id: expect.any(String),
      userId: 'user-1',
      projectId: null,
      name: 'Deploy',
      keyPrefix: result.token.slice(0, 6),
      keyHash: expect.any(String),
      expiresAt: '2026-12-31T00:00:00.000Z',
    });
  });

  it('revokes an active key and rejects already revoked keys', async () => {
    const repository = createRepositoryMock();
    repository.findById
      .mockImplementationOnce(async () => ({
        id: 'key-1',
        name: 'Deploy',
        keyPrefix: 'gvs_12',
        projectId: null,
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: '2026-08-18T00:00:00.000Z',
      }))
      .mockImplementationOnce(async () => ({
        id: 'key-1',
        name: 'Deploy',
        keyPrefix: 'gvs_12',
        projectId: null,
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: '2026-08-18T00:10:00.000Z',
        createdAt: '2026-08-18T00:00:00.000Z',
      }));

    const service = new ApiKeysService(repository);

    await service.revokeApiKey('user-1', 'key-1');
    await expect(service.revokeApiKey('user-1', 'key-1')).rejects.toThrow(
      'API key is already revoked',
    );
    expect(repository.revoke).toHaveBeenCalledTimes(1);
  });

  it('regenerates the same record instead of creating a new one', async () => {
    const repository = createRepositoryMock();
    repository.findById.mockImplementation(async () => ({
      id: 'key-1',
      name: 'Deploy',
      keyPrefix: 'gvs_old',
      projectId: null,
      expiresAt: '2026-12-31T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
      createdAt: '2026-08-18T00:00:00.000Z',
    }));

    const service = new ApiKeysService(repository);
    const result = await service.regenerateApiKey('user-1', 'key-1');

    expect(repository.updateKeyMaterial).toHaveBeenCalledWith('user-1', 'key-1', {
      keyPrefix: result.token.slice(0, 6),
      keyHash: expect.any(String),
      expiresAt: '2026-12-31T00:00:00.000Z',
    });
    expect(repository.create).not.toHaveBeenCalled();
    expect(result.key).toMatchObject({
      id: 'key-1',
      name: 'Deploy',
      keyPrefix: result.token.slice(0, 6),
      expiresAt: '2026-12-31T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
    });
  });

  it('does not regenerate revoked keys', async () => {
    const repository = createRepositoryMock();
    repository.findById.mockImplementation(async () => ({
      id: 'key-1',
      name: 'Deploy',
      keyPrefix: 'gvs_old',
      projectId: null,
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: '2026-08-18T00:10:00.000Z',
      createdAt: '2026-08-18T00:00:00.000Z',
    }));

    const service = new ApiKeysService(repository);

    await expect(service.regenerateApiKey('user-1', 'key-1')).rejects.toThrow('API key is revoked');
    expect(repository.updateKeyMaterial).not.toHaveBeenCalled();
  });
});
