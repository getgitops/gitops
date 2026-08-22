import { beforeEach, describe, expect, it } from 'vitest';
import { UserAccessService } from './user-access.service';
import { RoleDomain } from '../domain/role.domain';
import { UserAccessDomain } from '../domain/user-access.domain';
import { UserDomain } from '../domain/user.domain';

function role(input: {
  id: string;
  slug: string;
  scope?: 'cluster' | 'organization' | 'project';
  organizationId?: string | null;
  projectId?: string | null;
}) {
  return new RoleDomain({
    id: input.id,
    slug: input.slug,
    name: input.slug,
    scope: input.scope ?? 'cluster',
    organizationId: input.organizationId ?? null,
    projectId: input.projectId ?? null,
    permissions: [],
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

function organization(input: { id: string; name: string; slug: string }) {
  return {
    ...input,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

class FakeUserRepository {
  rows: UserDomain[] = [];

  async findById(id: string) {
    return this.rows.find((entry) => entry.id === id) ?? null;
  }

  async findByUsername(username: string) {
    return this.rows.find((entry) => entry.username === username) ?? null;
  }

  async listUsers() {
    return [...this.rows];
  }

  async createUser(input: { id: string; username: string; role: any }) {
    this.rows.push(
      user({ id: input.id, username: input.username, role: new RoleDomain(input.role) }),
    );
  }
}

class FakeRoleRepository {
  rows: RoleDomain[] = [];

  async findById(id: string) {
    return this.rows.find((entry) => entry.id === id) ?? null;
  }

  async findBySlug(slug: string) {
    return this.rows.find((entry) => entry.slug === slug) ?? null;
  }
}

class FakeUserAccessRepository {
  rows: UserAccessDomain[] = [];
  userRepository!: FakeUserRepository;
  roleRepository!: FakeRoleRepository;

  async findByScope(scope: 'cluster' | 'organization' | 'project', scopeId?: string) {
    return this.rows.filter((entry) => {
      if (entry.scope !== scope) return false;
      if (!scopeId) return true;
      if (scope === 'organization') return entry.organizationId === scopeId;
      if (scope === 'project') return entry.projectId === scopeId;
      return true;
    });
  }

  async findOne(input: {
    userId: string;
    scope: 'cluster' | 'organization' | 'project';
    organizationId?: string;
    projectId?: string;
  }) {
    return (
      this.rows.find((entry) => {
        if (entry.userId !== input.userId || entry.scope !== input.scope) return false;
        if (input.scope === 'organization') return entry.organizationId === input.organizationId;
        if (input.scope === 'project') return entry.projectId === input.projectId;
        return true;
      }) ?? null
    );
  }

  async findById(id: string) {
    return this.rows.find((entry) => entry.id === id) ?? null;
  }

  async create(input: {
    id: string;
    userId: string;
    roleId: string;
    scope: 'cluster' | 'organization' | 'project';
    organizationId?: string;
    projectId?: string;
    status?: 'active' | 'invited';
  }) {
    const userRow = await this.userRepository.findById(input.userId);
    const roleRow = await this.roleRepository.findById(input.roleId);
    this.rows.push(
      new UserAccessDomain({
        ...input,
        user: userRow?.toJson(),
        role: roleRow?.toJson(),
        status: input.status,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
    );
  }

  async update(id: string, changes: { roleId?: string; status?: 'active' | 'invited' }) {
    const existing = this.rows.find((entry) => entry.id === id);
    if (!existing) return;
    if (changes.roleId) {
      const roleRow = await this.roleRepository.findById(changes.roleId);
      existing.roleId = changes.roleId;
      existing.role = roleRow;
    }
    if (changes.status) existing.status = changes.status;
  }

  async deleteById(id: string) {
    this.rows = this.rows.filter((entry) => entry.id !== id);
  }
}

describe('UserAccessService', () => {
  let userRepository: FakeUserRepository;
  let roleRepository: FakeRoleRepository;
  let userAccessRepository: FakeUserAccessRepository;
  let service: UserAccessService;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    roleRepository = new FakeRoleRepository();
    userAccessRepository = new FakeUserAccessRepository();
    userAccessRepository.userRepository = userRepository;
    userAccessRepository.roleRepository = roleRepository;
    service = new UserAccessService(
      userRepository as any,
      roleRepository as any,
      userAccessRepository as any,
      { hashPassword: (password: string) => `hashed:${password}` },
    );

    roleRepository.rows.push(role({ id: 'cluster-user-id', slug: 'cluster-user' }));
  });

  it('creates an organization user and grants organization access', async () => {
    roleRepository.rows.push(
      role({
        id: 'org-developer-id',
        slug: 'developer',
        scope: 'organization',
        organizationId: 'gitops',
      }),
    );

    const created = await service.createOrganizationUser({
      organizationId: 'gitops',
      username: 'jose',
      password: 'secret',
      roleId: 'org-developer-id',
    });

    expect(created.username).toBe('jose');
    expect(created.role?.id).toBe('org-developer-id');
    expect(userRepository.rows[0].role?.slug).toBe('cluster-user');
  });

  it('assigns an existing user to a project role', async () => {
    userRepository.rows.push(user({ id: 'jose-id', username: 'jose', role: null }));
    roleRepository.rows.push(
      role({ id: 'project-admin-id', slug: 'project-admin', scope: 'project', projectId: 'kettu' }),
    );

    const assigned = await service.assignProjectUser({
      projectId: 'kettu',
      userId: 'jose-id',
      roleId: 'project-admin-id',
    });

    expect(assigned.username).toBe('jose');
    expect(assigned.role?.slug).toBe('project-admin');
    expect(assigned.status).toBe('active');
  });

  it('updates the role and status for an access row', async () => {
    userRepository.rows.push(user({ id: 'jose-id', username: 'jose', role: null }));
    roleRepository.rows.push(
      role({ id: 'project-developer-id', slug: 'developer', scope: 'project', projectId: 'kettu' }),
      role({ id: 'project-admin-id', slug: 'project-admin', scope: 'project', projectId: 'kettu' }),
    );
    await userAccessRepository.create({
      id: 'access-id',
      userId: 'jose-id',
      roleId: 'project-developer-id',
      scope: 'project',
      projectId: 'kettu',
    });

    const updated = await service.updateAccess({
      accessId: 'access-id',
      scope: 'project',
      scopeId: 'kettu',
      roleId: 'project-admin-id',
      status: 'invited',
    });

    expect(updated.role?.slug).toBe('project-admin');
    expect(updated.status).toBe('invited');
  });

  it('removes an access row', async () => {
    userRepository.rows.push(user({ id: 'jose-id', username: 'jose', role: null }));
    roleRepository.rows.push(
      role({ id: 'project-admin-id', slug: 'project-admin', scope: 'project', projectId: 'kettu' }),
    );
    await userAccessRepository.create({
      id: 'access-id',
      userId: 'jose-id',
      roleId: 'project-admin-id',
      scope: 'project',
      projectId: 'kettu',
    });

    await service.removeAccess({ accessId: 'access-id', scope: 'project', scopeId: 'kettu' });

    expect(userAccessRepository.rows).toEqual([]);
  });

  it('resends invitations only for invited access rows', async () => {
    userRepository.rows.push(user({ id: 'jose-id', username: 'jose', role: null }));
    roleRepository.rows.push(
      role({ id: 'project-admin-id', slug: 'project-admin', scope: 'project', projectId: 'kettu' }),
    );
    await userAccessRepository.create({
      id: 'access-id',
      userId: 'jose-id',
      roleId: 'project-admin-id',
      scope: 'project',
      projectId: 'kettu',
      status: 'invited',
    });

    const resent = await service.resendInvitation({
      accessId: 'access-id',
      scope: 'project',
      scopeId: 'kettu',
    });

    expect(resent.status).toBe('invited');
  });

  it('includes organization labels when listing cluster users', async () => {
    userRepository.rows.push(user({ id: 'jose-id', username: 'jose', role: null }));
    roleRepository.rows.push(
      role({
        id: 'org-developer-id',
        slug: 'developer',
        scope: 'organization',
        organizationId: 'gitops',
      }),
    );
    userAccessRepository.rows.push(
      new UserAccessDomain({
        id: 'access-id',
        userId: 'jose-id',
        roleId: 'org-developer-id',
        scope: 'organization',
        organizationId: 'gitops',
        user: userRepository.rows[0].toJson(),
        role: roleRepository.rows[1].toJson(),
        organization: organization({ id: 'gitops', name: 'GitOps', slug: 'gitops' }),
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
    );

    const users = await service.listUsers('cluster');

    expect(users[0].organizations).toEqual([
      { id: 'gitops', name: 'GitOps', slug: 'gitops', role: 'developer' },
    ]);
  });

  it('rejects a project role from a different project', async () => {
    userRepository.rows.push(user({ id: 'jose-id', username: 'jose', role: null }));
    roleRepository.rows.push(
      role({ id: 'project-admin-id', slug: 'project-admin', scope: 'project', projectId: 'other' }),
    );

    await expect(
      service.assignProjectUser({
        projectId: 'kettu',
        userId: 'jose-id',
        roleId: 'project-admin-id',
      }),
    ).rejects.toThrow(/does not belong/);
  });
});
