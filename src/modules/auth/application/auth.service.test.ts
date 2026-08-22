import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { RoleDomain } from '../domain/role.domain';
import { UserDomain } from '../domain/user.domain';

function role(input: { id: string; slug: string; permissions?: string[] }) {
  return new RoleDomain({
    id: input.id,
    slug: input.slug,
    name: input.slug,
    scope: 'cluster',
    permissions: input.permissions ?? [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
}

function user(input: { id: string; username: string; role: RoleDomain | null }) {
  return new UserDomain({
    id: input.id,
    username: input.username,
    email: null,
    password: 'hashed',
    role: input.role,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
}

class FakeUserRepository {
  rows = new Map<string, UserDomain>();
  updatedRoleIds: Array<{ userId: string; roleId: string }> = [];

  async findByUsername(username: string) {
    return [...this.rows.values()].find((entry) => entry.username === username) ?? null;
  }

  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }

  async updateRoleId(userId: string, roleId: string) {
    this.updatedRoleIds.push({ userId, roleId });
    const existing = this.rows.get(userId);
    if (existing) existing.role = role({ id: roleId, slug: 'cluster-admin' });
  }
}

class FakeRoleRepository {
  rows: RoleDomain[] = [];
  updates: Array<{ id: string; permissions?: string[] }> = [];

  async findBySlug(slug: string) {
    return this.rows.find((entry) => entry.slug === slug) ?? null;
  }

  async findById(id: string) {
    return this.rows.find((entry) => entry.id === id) ?? null;
  }

  async create(input: { id: string; slug: string; name: string; permissions: string[] }) {
    this.rows.push(role({ id: input.id, slug: input.slug, permissions: input.permissions }));
  }

  async update(id: string, changes: { name?: string; permissions?: string[] }) {
    this.updates.push({ id, permissions: changes.permissions });
    const existing = this.rows.find((entry) => entry.id === id);
    if (existing && changes.permissions) existing.permissions = changes.permissions;
  }
}

describe('AuthService bootstrapDefaults', () => {
  let userRepository: FakeUserRepository;
  let roleRepository: FakeRoleRepository;
  let passwordService: {
    ensureEncryptionKey: ReturnType<typeof vi.fn>;
    verifyPassword: ReturnType<typeof vi.fn>;
  };
  let sessionService: {
    createToken: ReturnType<typeof vi.fn>;
    parseAndVerifyToken: ReturnType<typeof vi.fn>;
  };
  let service: AuthService;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    roleRepository = new FakeRoleRepository();
    passwordService = {
      ensureEncryptionKey: vi.fn(),
      verifyPassword: vi.fn(),
    };
    sessionService = {
      createToken: vi.fn(),
      parseAndVerifyToken: vi.fn(),
    };
    service = new AuthService(
      userRepository as any,
      roleRepository as any,
      passwordService as any,
      sessionService as any,
    );
  });

  it('creates cluster-admin and assigns it to the admin user', async () => {
    userRepository.rows.set(
      'admin-user',
      user({ id: 'admin-user', username: 'admin', role: null }),
    );

    await service.bootstrapDefaults();

    const clusterAdmin = roleRepository.rows.find((entry) => entry.slug === 'cluster-admin');
    const clusterUser = roleRepository.rows.find((entry) => entry.slug === 'cluster-user');
    expect(clusterAdmin?.permissions).toEqual(['vault:all', 'openreport:all', 'stateiac:all']);
    expect(clusterUser?.permissions).toEqual([]);
    expect(userRepository.updatedRoleIds).toEqual([
      { userId: 'admin-user', roleId: clusterAdmin?.id },
    ]);
  });

  it('keeps cluster-admin permissions current when the role already exists', async () => {
    const clusterAdmin = role({ id: 'cluster-admin-id', slug: 'cluster-admin', permissions: [] });
    roleRepository.rows.push(clusterAdmin);
    userRepository.rows.set(
      'admin-user',
      user({ id: 'admin-user', username: 'admin', role: clusterAdmin }),
    );

    await service.bootstrapDefaults();

    expect(roleRepository.updates).toEqual([
      { id: 'cluster-admin-id', permissions: ['vault:all', 'openreport:all', 'stateiac:all'] },
    ]);
    expect(userRepository.updatedRoleIds).toEqual([]);
  });
});
