import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeysService } from './apikeys.service';
import type { ApiKeyView } from '../domain/entities';
import type { ApiKeyRepository } from '../infrastructure/repositories/apikey.repository';

function createRepositoryMock() {
  return {
    listByUser: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    revoke: vi.fn(),
    updateKeyMaterial: vi.fn(),
  } as unknown as ApiKeyRepository;
}

describe('ApiKeysService', () => {
  const randomBytesSpy = vi.spyOn(crypto, 'randomBytes');
  const randomUuidSpy = vi.spyOn(crypto, 'randomUUID');

  beforeEach(() => {
    vi.clearAllMocks();
    randomBytesSpy.mockReturnValue(Buffer.alloc(24, 0x12));
    randomUuidSpy.mockReturnValue('11111111-1111-4111-8111-111111111111');
  });

  it('lists keys through the repository', async () => {
    const repository = createRepositoryMock();
    const keys: ApiKeyView[] = [
      {
        id: 'key-1',
        name: 'Deploy',
        keyPrefix: 'gvs_12',
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: '2026-08-18T00:00:00.000Z',
      },
    ];

    repository.listByUser.mockResolvedValue(keys);

    const service = new ApiKeysService(repository);

    await expect(service.listActiveApiKeys('user-1')).resolves.toEqual(keys);
    expect(repository.listByUser).toHaveBeenCalledWith('user-1');
  });

  it('creates a key with a capped prefix and hashed token', async () => {
    const repository = createRepositoryMock();
    const service = new ApiKeysService(repository);

    const result = await service.createApiKey('user-1', 'Deploy', '2026-12-31T00:00:00.000Z');

    expect(result.token).toBe('gvs_121212121212121212121212121212121212121212121212');
    expect(result.key).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Deploy',
      keyPrefix: 'gvs_12',
      expiresAt: '2026-12-31T00:00:00.000Z',
      lastUsedAt: null,
    });

    expect(repository.create).toHaveBeenCalledWith({
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'user-1',
      name: 'Deploy',
      keyPrefix: 'gvs_12',
      keyHash: expect.any(String),
      expiresAt: '2026-12-31T00:00:00.000Z',
    });
  });

  it('revokes an active key and rejects already revoked keys', async () => {
    const repository = createRepositoryMock();
    repository.findById
      .mockResolvedValueOnce({
        id: 'key-1',
        name: 'Deploy',
        keyPrefix: 'gvs_12',
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: '2026-08-18T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'key-1',
        name: 'Deploy',
        keyPrefix: 'gvs_12',
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: '2026-08-18T00:10:00.000Z',
        createdAt: '2026-08-18T00:00:00.000Z',
      });

    const service = new ApiKeysService(repository);

    await service.revokeApiKey('user-1', 'key-1');
    await expect(service.revokeApiKey('user-1', 'key-1')).rejects.toThrow('API key is already revoked');
    expect(repository.revoke).toHaveBeenCalledTimes(1);
  });

  it('regenerates the same record instead of creating a new one', async () => {
    const repository = createRepositoryMock();
    repository.findById.mockResolvedValue({
      id: 'key-1',
      name: 'Deploy',
      keyPrefix: 'gvs_old',
      expiresAt: '2026-12-31T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
      createdAt: '2026-08-18T00:00:00.000Z',
    });

    const service = new ApiKeysService(repository);
    const result = await service.regenerateApiKey('user-1', 'key-1');

    expect(repository.updateKeyMaterial).toHaveBeenCalledWith('user-1', 'key-1', {
      keyPrefix: 'gvs_12',
      keyHash: expect.any(String),
      expiresAt: '2026-12-31T00:00:00.000Z',
    });
    expect(repository.create).not.toHaveBeenCalled();
    expect(result.key).toMatchObject({
      id: 'key-1',
      name: 'Deploy',
      keyPrefix: 'gvs_12',
      expiresAt: '2026-12-31T00:00:00.000Z',
      lastUsedAt: null,
    });
  });

  it('does not regenerate revoked keys', async () => {
    const repository = createRepositoryMock();
    repository.findById.mockResolvedValue({
      id: 'key-1',
      name: 'Deploy',
      keyPrefix: 'gvs_old',
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: '2026-08-18T00:10:00.000Z',
      createdAt: '2026-08-18T00:00:00.000Z',
    });

    const service = new ApiKeysService(repository);

    await expect(service.regenerateApiKey('user-1', 'key-1')).rejects.toThrow('API key is revoked');
    expect(repository.updateKeyMaterial).not.toHaveBeenCalled();
  });
});