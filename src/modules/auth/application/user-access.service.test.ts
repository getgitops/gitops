import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UserAccessService,
  type InvitationNotifierPort,
  type InvitationTokenIssuerPort,
} from './user-access.service';
import { RoleDomain } from '../domain/role.domain';
import { UserAccessDomain } from '../domain/user-access.domain';
import { UserDomain } from '../domain/user.domain';
import { RecordingEventBus } from '#lib/server/events/testing';

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

  async deleteById(id: string) {
    this.rows = this.rows.filter((entry) => entry.id !== id);
  }

  roleRepository?: FakeRoleRepository;

  async updateRoleId(id: string, roleId: string) {
    const row = this.rows.find((entry) => entry.id === id);
    const nextRole = await this.roleRepository?.findById(roleId);
    if (row && nextRole) row.role = nextRole;
  }

  async updateStatus(id: string, status: 'active' | 'invited') {
    const row = this.rows.find((entry) => entry.id === id);
    if (row) row.status = status;
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

  async findByUserId(userId: string) {
    return this.rows.filter((entry) => entry.userId === userId);
  }

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
  let invitationNotifier: InvitationNotifierPort;
  let invitationTokens: InvitationTokenIssuerPort;
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

  describe('provisionClusterUser', () => {
    it('creates an active cluster-user account with no organization access', async () => {
      const created = await service.provisionClusterUser('Ana@Gigigo.com');

      expect(created.status).toBe('active');
      expect(userRepository.rows[0]).toMatchObject({
        username: 'ana',
        email: 'ana@gigigo.com',
        status: 'active',
      });
      expect(userRepository.rows[0].role?.slug).toBe('cluster-user');
      expect(userAccessRepository.rows).toHaveLength(0);
      expect(invitationNotifier.sendInvitation).not.toHaveBeenCalled();
    });

    it('returns the existing account for that email instead of creating another', async () => {
      userRepository.rows.push(
        user({ id: 'existing', username: 'ana', email: 'ana@gigigo.com', role: null }),
      );

      const provisioned = await service.provisionClusterUser('ana@gigigo.com');

      expect(provisioned.id).toBe('existing');
      expect(userRepository.rows).toHaveLength(1);
    });

    it('requires an email', async () => {
      await expect(service.provisionClusterUser('  ')).rejects.toThrow(/Email is required/);
      expect(userRepository.rows).toHaveLength(0);
    });
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

  it('removes only the selected project access', async () => {
    userRepository.rows.push(user({ id: 'jose-id', username: 'jose', role: null }));
    roleRepository.rows.push(
      role({ id: 'project-admin-id', slug: 'project-admin', scope: 'project', projectId: 'kettu' }),
      role({ id: 'project-developer-id', slug: 'developer', scope: 'project', projectId: 'other' }),
    );
    await userAccessRepository.create({
      id: 'access-id',
      userId: 'jose-id',
      roleId: 'project-admin-id',
      scope: 'project',
      projectId: 'kettu',
    });
    await userAccessRepository.create({
      id: 'other-access-id',
      userId: 'jose-id',
      roleId: 'project-developer-id',
      scope: 'project',
      projectId: 'other',
    });

    await service.removeAccess({ accessId: 'access-id', scope: 'project', scopeId: 'kettu' });

    expect(userAccessRepository.rows.map((entry) => entry.id)).toEqual(['other-access-id']);
    expect(await userRepository.findById('jose-id')).not.toBeNull();
  });

  it('removes all user access and the user when removed from an organization', async () => {
    userRepository.rows.push(user({ id: 'jose-id', username: 'jose', role: null }));
    roleRepository.rows.push(
      role({
        id: 'org-admin-id',
        slug: 'org-admin',
        scope: 'organization',
        organizationId: 'gitops',
      }),
      role({ id: 'project-admin-id', slug: 'project-admin', scope: 'project', projectId: 'kettu' }),
      role({ id: 'project-developer-id', slug: 'developer', scope: 'project', projectId: 'other' }),
    );
    await userAccessRepository.create({
      id: 'organization-access-id',
      userId: 'jose-id',
      roleId: 'org-admin-id',
      scope: 'organization',
      organizationId: 'gitops',
    });
    await userAccessRepository.create({
      id: 'project-access-id',
      userId: 'jose-id',
      roleId: 'project-admin-id',
      scope: 'project',
      projectId: 'kettu',
    });
    await userAccessRepository.create({
      id: 'other-project-access-id',
      userId: 'jose-id',
      roleId: 'project-developer-id',
      scope: 'project',
      projectId: 'other',
    });

    await service.removeAccess({
      accessId: 'organization-access-id',
      scope: 'organization',
      scopeId: 'gitops',
    });

    expect(userAccessRepository.rows).toEqual([]);
    expect(await userRepository.findById('jose-id')).toBeNull();
  });

  it('removes all user access and the user when removed from cluster settings', async () => {
    userRepository.rows.push(user({ id: 'jose-id', username: 'jose', role: null }));
    roleRepository.rows.push(
      role({
        id: 'org-admin-id',
        slug: 'org-admin',
        scope: 'organization',
        organizationId: 'gitops',
      }),
      role({ id: 'project-admin-id', slug: 'project-admin', scope: 'project', projectId: 'kettu' }),
    );
    await userAccessRepository.create({
      id: 'organization-access-id',
      userId: 'jose-id',
      roleId: 'org-admin-id',
      scope: 'organization',
      organizationId: 'gitops',
    });
    await userAccessRepository.create({
      id: 'project-access-id',
      userId: 'jose-id',
      roleId: 'project-admin-id',
      scope: 'project',
      projectId: 'kettu',
    });

    await service.removeAccess({ accessId: 'jose-id', scope: 'cluster' });

    expect(userAccessRepository.rows).toEqual([]);
    expect(await userRepository.findById('jose-id')).toBeNull();
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

describe('UserAccessService events', () => {
  let userRepository: FakeUserRepository;
  let roleRepository: FakeRoleRepository;
  let userAccessRepository: FakeUserAccessRepository;
  let events: RecordingEventBus;
  let service: UserAccessService;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    roleRepository = new FakeRoleRepository();
    userAccessRepository = new FakeUserAccessRepository();
    userAccessRepository.userRepository = userRepository;
    userAccessRepository.roleRepository = roleRepository;
    userRepository.roleRepository = roleRepository;
    events = new RecordingEventBus();
    service = new UserAccessService(
      userRepository as any,
      roleRepository as any,
      userAccessRepository as any,
      { hashPassword: (password: string) => `hashed:${password}` },
      { sendInvitation: vi.fn(async () => {}) },
      { issueToken: vi.fn(async () => ({ token: 'raw-token', expiresAt: '2024-01-08' })) },
      { events, projects: { getProject: async () => ({ organization: { id: 'gitops' } }) } },
    );
    roleRepository.rows.push(
      role({ id: 'cluster-user-id', slug: 'cluster-user' }),
      role({ id: 'cluster-admin-id', slug: 'cluster-admin' }),
      role({
        id: 'org-dev',
        slug: 'org-developer',
        scope: 'organization',
        organizationId: 'gitops',
      }),
      role({ id: 'org-admin', slug: 'org-admin', scope: 'organization', organizationId: 'gitops' }),
      role({ id: 'project-dev', slug: 'project-dev', scope: 'project', projectId: 'shop' }),
    );
    userRepository.rows.push(
      user({ id: 'ana', username: 'ana', email: 'ana@example.com', role: roleRepository.rows[0] }),
    );
  });

  it('publishes access.granted for organization and project assignments', async () => {
    const orgAccess = await service.assignOrganizationUser({
      organizationId: 'gitops',
      userId: 'ana',
      roleId: 'org-dev',
    });
    const projectAccess = await service.assignProjectUser({
      projectId: 'shop',
      userId: 'ana',
      roleId: 'project-dev',
    });

    expect(events.ofType('access.granted').map((event) => [event.payload, event.scope])).toEqual([
      [
        {
          accessId: orgAccess.id,
          userId: 'ana',
          roleId: 'org-dev',
          scope: 'organization',
          status: 'active',
        },
        { organizationId: 'gitops', projectId: null },
      ],
      [
        {
          accessId: projectAccess.id,
          userId: 'ana',
          roleId: 'project-dev',
          scope: 'project',
          status: 'active',
        },
        { organizationId: 'gitops', projectId: 'shop' },
      ],
    ]);
  });

  it('publishes access.granted and user.invited for an invitation, without token or URL', async () => {
    await service.inviteOrganizationUser({
      organizationId: 'gitops',
      organizationName: 'GitOps',
      email: 'new@example.com',
      inviteUrl: 'https://gitops.example.com/auth/invitation',
    });

    expect(events.types()).toEqual(['access.granted', 'user.invited']);
    const invited = userRepository.rows.find((row) => row.email === 'new@example.com')!;
    expect(events.ofType('user.invited')[0].payload).toEqual({
      userId: invited.id,
      roleId: 'org-dev',
      organizationId: 'gitops',
    });
    const serialized = JSON.stringify(events.events);
    expect(serialized).not.toContain('raw-token');
    expect(serialized).not.toContain('auth/invitation');
    expect(serialized).not.toContain('new@example.com');
  });

  it('publishes access.updated with the previous role and status', async () => {
    const access = await service.assignOrganizationUser({
      organizationId: 'gitops',
      userId: 'ana',
      roleId: 'org-dev',
    });
    events.clear();

    await service.updateAccess({
      accessId: access.id,
      scope: 'organization',
      scopeId: 'gitops',
      roleId: 'org-admin',
      status: 'active',
    });

    expect(events.ofType('access.updated')[0].payload).toEqual({
      accessId: access.id,
      userId: 'ana',
      roleId: 'org-admin',
      scope: 'organization',
      status: 'active',
      previousRoleId: 'org-dev',
      previousStatus: 'active',
    });
  });

  it('publishes access.updated for a cluster role change', async () => {
    await service.updateAccess({
      accessId: 'ana',
      scope: 'cluster',
      roleId: 'cluster-admin-id',
      status: 'active',
    });

    const [event] = events.ofType('access.updated');
    expect(event.payload).toMatchObject({
      accessId: 'ana',
      userId: 'ana',
      scope: 'cluster',
      roleId: 'cluster-admin-id',
      previousRoleId: 'cluster-user-id',
    });
    expect(event.scope).toEqual({});
  });

  it('publishes access.revoked for a project membership', async () => {
    const access = await service.assignProjectUser({
      projectId: 'shop',
      userId: 'ana',
      roleId: 'project-dev',
    });
    events.clear();

    await service.removeAccess({ accessId: access.id, scope: 'project', scopeId: 'shop' });

    expect(events.ofType('access.revoked').map((event) => event.payload.accessId)).toEqual([
      access.id,
    ]);
  });

  it('revokes every membership and the account when removing an organization user', async () => {
    const orgAccess = await service.assignOrganizationUser({
      organizationId: 'gitops',
      userId: 'ana',
      roleId: 'org-dev',
    });
    const projectAccess = await service.assignProjectUser({
      projectId: 'shop',
      userId: 'ana',
      roleId: 'project-dev',
    });
    events.clear();

    await service.removeAccess({
      accessId: orgAccess.id,
      scope: 'organization',
      scopeId: 'gitops',
    });

    expect(
      events.ofType('access.revoked').map((event) => [event.payload.accessId, event.payload.scope]),
    ).toEqual([
      [orgAccess.id, 'organization'],
      [projectAccess.id, 'project'],
      ['ana', 'cluster'],
    ]);
  });

  it('publishes nothing when the operation is rejected', async () => {
    await service.assignOrganizationUser({
      organizationId: 'gitops',
      userId: 'ana',
      roleId: 'org-dev',
    });
    events.clear();

    await expect(
      service.assignOrganizationUser({
        organizationId: 'gitops',
        userId: 'ana',
        roleId: 'org-dev',
      }),
    ).rejects.toThrow(/already has access/);
    await expect(
      service.assignProjectUser({ projectId: 'shop', userId: 'ana', roleId: 'org-dev' }),
    ).rejects.toThrow();
    await expect(
      service.removeAccess({ accessId: 'missing', scope: 'project', scopeId: 'shop' }),
    ).rejects.toThrow();

    expect(events.events).toEqual([]);
  });
});
