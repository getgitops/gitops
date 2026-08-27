import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function user(input: {
  id: string;
  username: string;
  role: RoleDomain | null;
  email?: string | null;
  status?: 'active' | 'invited';
}) {
  return new UserDomain({
    id: input.id,
    username: input.username,
    email: input.email ?? null,
    password: 'hashed',
    status: input.status ?? 'active',
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

  async findByEmail(email: string) {
    return this.rows.find((entry) => entry.email === email) ?? null;
  }

  async listUsers() {
    return [...this.rows];
  }

  async createUser(input: {
    id: string;
    username: string;
    email?: string | null;
    role: any;
    status?: 'active' | 'invited';
  }) {
    this.rows.push(
      user({
        id: input.id,
        username: input.username,
        email: input.email ?? null,
        status: input.status,
        role: new RoleDomain(input.role),
      }),
    );
  }
}

class FakeRoleRepository {
  rows: RoleDomain[] = [];

  async findById(id: string) {
    return this.rows.find((entry) => entry.id === id) ?? null;
  }

  async findBySlug(slug: string, scope?: string, scopeId?: string) {
    return (
      this.rows.find((entry) => {
        if (entry.slug !== slug) return false;
        if (!scope) return true;
        if (entry.scope !== scope) return false;
        if (scope === 'organization') return entry.organizationId === scopeId;
        if (scope === 'project') return entry.projectId === scopeId;
        return true;
      }) ?? null
    );
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
  let invitationNotifier: { sendInvitation: ReturnType<typeof vi.fn> };
  let invitationTokens: { issueToken: ReturnType<typeof vi.fn> };
  let service: UserAccessService;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    roleRepository = new FakeRoleRepository();
    userAccessRepository = new FakeUserAccessRepository();
    userAccessRepository.userRepository = userRepository;
    userAccessRepository.roleRepository = roleRepository;
    invitationNotifier = { sendInvitation: vi.fn(async () => {}) };
    invitationTokens = {
      issueToken: vi.fn(async () => ({
        token: 'raw-token',
        expiresAt: '2024-01-08T00:00:00.000Z',
      })),
    };
    service = new UserAccessService(
      userRepository as any,
      roleRepository as any,
      userAccessRepository as any,
      { hashPassword: (password: string) => `hashed:${password}` },
      invitationNotifier,
      invitationTokens,
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

  describe('inviteOrganizationUser', () => {
    function seedOrganizationRole() {
      roleRepository.rows.push(
        role({
          id: 'org-developer-id',
          slug: 'org-developer',
          scope: 'organization',
          organizationId: 'gitops',
        }),
      );
    }

    function invite(email = 'Jose.Doe@Example.com') {
      return service.inviteOrganizationUser({
        organizationId: 'gitops',
        organizationName: 'GitOps',
        email,
        inviteUrl: 'https://app.local/auth/invitation',
        invitedBy: 'admin',
      });
    }

    it('creates the user as invited and grants invited organization access', async () => {
      seedOrganizationRole();

      const invited = await invite();

      expect(invited.status).toBe('invited');
      expect(invited.role?.slug).toBe('org-developer');
      expect(userRepository.rows[0].status).toBe('invited');
      expect(userRepository.rows[0].email).toBe('jose.doe@example.com');
      expect(userRepository.rows[0].role?.slug).toBe('cluster-user');
    });

    it('derives a unique username from the email local part', async () => {
      seedOrganizationRole();
      userRepository.rows.push(user({ id: 'existing', username: 'jose.doe', role: null }));

      await invite();

      expect(userRepository.rows[1].username).toBe('jose.doe-1');
    });

    it('sends the invitation notification with a tokenized link', async () => {
      seedOrganizationRole();

      await invite();

      expect(invitationTokens.issueToken).toHaveBeenCalledWith(userRepository.rows[0].id);
      expect(invitationNotifier.sendInvitation).toHaveBeenCalledWith({
        email: 'jose.doe@example.com',
        username: 'jose.doe',
        organizationName: 'GitOps',
        roleName: 'org-developer',
        inviteUrl: 'https://app.local/auth/invitation?token=raw-token',
        expiresAt: '2024-01-08T00:00:00.000Z',
        invitedBy: 'admin',
      });
    });

    it('rejects invalid emails', async () => {
      seedOrganizationRole();

      await expect(invite('   ')).rejects.toThrow(/Email is required/);
      await expect(invite('not-an-email')).rejects.toThrow(/Email is not valid/);
      expect(invitationNotifier.sendInvitation).not.toHaveBeenCalled();
    });

    it('reuses an existing invited account and re-sends the invitation', async () => {
      seedOrganizationRole();
      userRepository.rows.push(
        user({
          id: 'existing',
          username: 'jose.doe',
          email: 'jose.doe@example.com',
          status: 'invited',
          role: null,
        }),
      );

      const invited = await invite();

      expect(userRepository.rows).toHaveLength(1);
      expect(invited.userId).toBe('existing');
      expect(invited.status).toBe('invited');
      expect(invitationNotifier.sendInvitation).toHaveBeenCalledTimes(1);
    });

    it('grants access without notifying when the account is already active', async () => {
      seedOrganizationRole();
      userRepository.rows.push(
        user({
          id: 'existing',
          username: 'jose.doe',
          email: 'jose.doe@example.com',
          status: 'active',
          role: null,
        }),
      );

      const invited = await invite();

      expect(userRepository.rows).toHaveLength(1);
      expect(invited.userId).toBe('existing');
      expect(invited.status).toBe('active');
      expect(invitationTokens.issueToken).not.toHaveBeenCalled();
      expect(invitationNotifier.sendInvitation).not.toHaveBeenCalled();
    });

    it('rejects a user that already has access to the organization', async () => {
      seedOrganizationRole();
      userRepository.rows.push(
        user({
          id: 'existing',
          username: 'jose.doe',
          email: 'jose.doe@example.com',
          status: 'active',
          role: null,
        }),
      );
      await userAccessRepository.create({
        id: 'access-id',
        userId: 'existing',
        roleId: 'org-developer-id',
        scope: 'organization',
        organizationId: 'gitops',
      });

      await expect(invite()).rejects.toThrow(/already has access/);
    });

    it('fails when the organization has no default role', async () => {
      await expect(invite()).rejects.toThrow(/Default organization role not found/);
    });

    it('uses an explicit role when provided', async () => {
      seedOrganizationRole();
      roleRepository.rows.push(
        role({
          id: 'org-admin-id',
          slug: 'org-admin',
          scope: 'organization',
          organizationId: 'gitops',
        }),
      );

      const invited = await service.inviteOrganizationUser({
        organizationId: 'gitops',
        organizationName: 'GitOps',
        email: 'jose@example.com',
        inviteUrl: 'https://app.local/auth/invitation',
        roleId: 'org-admin-id',
      });

      expect(invited.role?.slug).toBe('org-admin');
    });
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
