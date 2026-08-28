import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeysService } from './apikeys.service';
import type { ApiKeyView } from '../domain/entities';

function apiKey(overrides: Partial<ApiKeyView> = {}): ApiKeyView {
  return {
    id: 'key-1',
    name: 'Deploy',
    keyPrefix: 'gvs_121212',
    userId: 'user-1',
    projectId: null,
    roleId: null,
    createdByUserId: 'user-1',
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  };
}

function projectRole(overrides: Record<string, unknown> = {}) {
  const role = {
    id: 'role-1',
    name: 'Project Developer',
    slug: 'project-developer',
    scope: 'project',
    organizationId: null,
    projectId: 'project-1',
    project: null,
    permissions: ['project:codereport:reports:create'],
    ...overrides,
  };
  return { ...role, toJson: () => role };
}

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

function createRoleRepositoryMock(role: unknown = projectRole()): any {
  return { findById: vi.fn(async () => role) };
}

describe('ApiKeysService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists keys through the repository', async () => {
    const repository = createRepositoryMock();
    const keys = [apiKey()];
    repository.listByUser.mockImplementation(async () => keys);

    const service = new ApiKeysService(repository);

    await expect(service.listActiveApiKeys('user-1')).resolves.toEqual(keys);
    expect(repository.listByUser).toHaveBeenCalledWith('user-1');
  });

  it('validates an active api key token', async () => {
    const repository = createRepositoryMock();
    repository.findValidByHash.mockImplementation(async () => apiKey());

    const service = new ApiKeysService(repository);

    await expect(service.validateApiKey('gvs_121212')).resolves.toBe(true);
    expect(repository.findValidByHash).toHaveBeenCalledWith(expect.any(String));
  });

  it('rejects tokens that are empty or not gitops tokens', async () => {
    const repository = createRepositoryMock();
    const service = new ApiKeysService(repository);

    await expect(service.validateApiKey('   ')).resolves.toBe(false);
    await expect(service.validateApiKey('some-other-token')).resolves.toBe(false);
    expect(repository.findValidByHash).not.toHaveBeenCalled();
  });

  it('returns false when the token does not map to an active key', async () => {
    const repository = createRepositoryMock();
    repository.findValidByHash.mockImplementation(async () => null);

    const service = new ApiKeysService(repository);

    await expect(service.validateApiKey('gvs_missing')).resolves.toBe(false);
  });

  it('records the usage of a resolved key', async () => {
    const repository = createRepositoryMock();
    repository.findValidByHash.mockImplementation(async () => apiKey());

    const service = new ApiKeysService(repository);
    await service.resolveApiKey('gvs_121212');

    expect(repository.touchLastUsed).toHaveBeenCalledWith('key-1');
  });

  it('creates a user key with a hashed token and no project scope', async () => {
    const repository = createRepositoryMock();
    const service = new ApiKeysService(repository);

    const result = await service.createApiKey('user-1', 'Deploy', '2026-12-31T00:00:00.000Z');

    expect(result.token.startsWith('gvs_')).toBe(true);
    expect(repository.create).toHaveBeenCalledWith({
      id: expect.any(String),
      userId: 'user-1',
      projectId: null,
      roleId: null,
      createdByUserId: 'user-1',
      name: 'Deploy',
      keyPrefix: result.token.slice(0, 10),
      keyHash: expect.any(String),
      expiresAt: '2026-12-31T00:00:00.000Z',
    });
  });

  it('creates a project key bound to a project role and no user', async () => {
    const repository = createRepositoryMock();
    const service = new ApiKeysService(repository, createRoleRepositoryMock());

    const result = await service.createProjectApiKey({
      projectId: 'project-1',
      roleId: 'role-1',
      name: 'CI pipeline',
      expiresAt: null,
      createdByUserId: 'user-1',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        projectId: 'project-1',
        roleId: 'role-1',
        createdByUserId: 'user-1',
      }),
    );
    expect(result.key.userId).toBeNull();
  });

  it('rejects a project key whose role belongs to another project', async () => {
    const repository = createRepositoryMock();
    const service = new ApiKeysService(
      repository,
      createRoleRepositoryMock(projectRole({ projectId: 'project-2' })),
    );

    await expect(
      service.createProjectApiKey({
        projectId: 'project-1',
        roleId: 'role-1',
        name: 'CI pipeline',
        expiresAt: null,
        createdByUserId: 'user-1',
      }),
    ).rejects.toThrow('The selected role does not belong to this project');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('authenticates a project key into a project + role identity', async () => {
    const repository = createRepositoryMock();
    repository.findValidByHash.mockImplementation(async () =>
      apiKey({ userId: null, projectId: 'project-1', roleId: 'role-1' }),
    );
    const projectLookup = {
      getProject: vi.fn(async () => ({ id: 'project-1', organization: { id: 'org-1' } })),
    };

    const service = new ApiKeysService(repository, createRoleRepositoryMock(), projectLookup);
    const identity = await service.authenticate('gvs_121212');

    expect(identity).toMatchObject({
      id: 'key-1',
      projectId: 'project-1',
      organizationId: 'org-1',
      userId: null,
    });
    expect(identity?.role?.slug).toBe('project-developer');
  });

  it('does not authenticate a project key whose role no longer belongs to the project', async () => {
    const repository = createRepositoryMock();
    repository.findValidByHash.mockImplementation(async () =>
      apiKey({ userId: null, projectId: 'project-1', roleId: 'role-1' }),
    );

    const service = new ApiKeysService(
      repository,
      createRoleRepositoryMock(projectRole({ projectId: 'project-2' })),
    );

    await expect(service.authenticate('gvs_121212')).resolves.toBeNull();
  });

  it('does not authenticate a revoked or expired key', async () => {
    const repository = createRepositoryMock();
    repository.findValidByHash.mockImplementation(async () => null);

    const service = new ApiKeysService(repository, createRoleRepositoryMock());

    await expect(service.authenticate('gvs_121212')).resolves.toBeNull();
  });

  it('revokes an active key and rejects already revoked keys', async () => {
    const repository = createRepositoryMock();
    repository.findById
      .mockImplementationOnce(async () => apiKey())
      .mockImplementationOnce(async () => apiKey({ revokedAt: '2026-08-18T00:10:00.000Z' }));

    const service = new ApiKeysService(repository);

    await service.revokeApiKey('user-1', 'key-1');
    await expect(service.revokeApiKey('user-1', 'key-1')).rejects.toThrow(
      'API key is already revoked',
    );
    expect(repository.revoke).toHaveBeenCalledTimes(1);
  });

  it('revokes a project key only from its own project', async () => {
    const repository = createRepositoryMock();
    repository.findByIdAny.mockImplementation(async () =>
      apiKey({ userId: null, projectId: 'project-1', roleId: 'role-1' }),
    );

    const service = new ApiKeysService(repository);

    await expect(service.revokeProjectApiKey('project-2', 'key-1')).rejects.toThrow(
      'API key not found',
    );
    await service.revokeProjectApiKey('project-1', 'key-1');
    expect(repository.revokeAny).toHaveBeenCalledWith('key-1');
  });

  it('rotates the same record instead of creating a new one', async () => {
    const repository = createRepositoryMock();
    repository.findById.mockImplementation(async () =>
      apiKey({ expiresAt: '2026-12-31T00:00:00.000Z' }),
    );

    const service = new ApiKeysService(repository);
    const result = await service.regenerateApiKey('user-1', 'key-1');

    expect(repository.updateKeyMaterial).toHaveBeenCalledWith('key-1', {
      keyPrefix: result.token.slice(0, 10),
      keyHash: expect.any(String),
      expiresAt: '2026-12-31T00:00:00.000Z',
    });
    expect(repository.create).not.toHaveBeenCalled();
    expect(result.key).toMatchObject({
      id: 'key-1',
      keyPrefix: result.token.slice(0, 10),
      lastUsedAt: null,
      revokedAt: null,
    });
  });

  it('rotates a project key and keeps its role', async () => {
    const repository = createRepositoryMock();
    repository.findByIdAny.mockImplementation(async () =>
      apiKey({ userId: null, projectId: 'project-1', roleId: 'role-1' }),
    );

    const service = new ApiKeysService(repository);
    const result = await service.regenerateProjectApiKey('project-1', 'key-1');

    expect(result.key.roleId).toBe('role-1');
    expect(repository.updateKeyMaterial).toHaveBeenCalledWith('key-1', expect.any(Object));
  });

  it('does not rotate revoked keys', async () => {
    const repository = createRepositoryMock();
    repository.findById.mockImplementation(async () =>
      apiKey({ revokedAt: '2026-08-18T00:10:00.000Z' }),
    );

    const service = new ApiKeysService(repository);

    await expect(service.regenerateApiKey('user-1', 'key-1')).rejects.toThrow('API key is revoked');
    expect(repository.updateKeyMaterial).not.toHaveBeenCalled();
  });
});
