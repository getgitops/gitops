import { beforeEach, describe, expect, it } from 'vitest';
import { CanCanService } from './cancan.service';
import { RoleDomain } from '../domain/role.domain';
import { UserDomain } from '../domain/user.domain';
import { UserAccessDomain } from '../domain/user-access.domain';

function role(input: { id: string; slug: string; permissions?: string[]; scope?: string }) {
  return new RoleDomain({
    id: input.id,
    slug: input.slug,
    name: input.slug,
    scope: input.scope ?? 'cluster',
    permissions: input.permissions ?? [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
}

function user(input: { id: string; role: RoleDomain | null }) {
  return new UserDomain({
    id: input.id,
    username: input.id,
    email: null,
    password: 'hashed',
    role: input.role,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
}

function access(input: {
  id: string;
  userId: string;
  role: RoleDomain;
  scope: 'organization' | 'project';
  organizationId?: string;
  projectId?: string;
  project?: { id: string; organizationId: string };
}) {
  return new UserAccessDomain({
    id: input.id,
    userId: input.userId,
    roleId: input.role.id,
    role: input.role,
    scope: input.scope,
    organizationId: input.organizationId,
    projectId: input.projectId,
    project: input.project
      ? {
          id: input.project.id,
          name: input.project.id,
          slug: input.project.id,
          organization: { id: input.project.organizationId, name: '', slug: '' },
        }
      : undefined,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
}

class FakeUserRepository {
  rows = new Map<string, UserDomain>();

  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
}

class FakeUserAccessRepository {
  rows: UserAccessDomain[] = [];

  async findByUserId(userId: string) {
    return this.rows.filter((entry) => entry.userId === userId);
  }
}

class FakeProjectLookup {
  organizationsByProjectId = new Map<string, string>();

  async getProject(id: string) {
    const organizationId = this.organizationsByProjectId.get(id);
    return organizationId ? { id, organization: { id: organizationId } } : null;
  }
}

describe('CanCanService', () => {
  let userRepository: FakeUserRepository;
  let userAccessRepository: FakeUserAccessRepository;
  let projectLookup: FakeProjectLookup;
  let service: CanCanService;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    userAccessRepository = new FakeUserAccessRepository();
    projectLookup = new FakeProjectLookup();
    service = new CanCanService(userRepository, userAccessRepository, projectLookup);
  });

  it('matches explicit grants and section:all shortcuts', () => {
    expect(CanCanService.hasPermission([], 'vault:read')).toBe(false);
    expect(CanCanService.hasPermission(null, 'vault:read')).toBe(false);
    expect(CanCanService.hasPermission(undefined, 'vault:read')).toBe(false);
    expect(CanCanService.hasPermission(['vault:read'], 'vault:read')).toBe(true);
    expect(CanCanService.hasPermission(['vault:read'], 'vault:delete')).toBe(false);
    expect(CanCanService.hasPermission(['vault:all'], 'vault:delete')).toBe(true);
    expect(CanCanService.hasPermission(['vault:all'], 'openreport:read')).toBe(false);
    expect(CanCanService.hasPermission(['project:vault:read'], 'vault:read')).toBe(true);
    expect(CanCanService.hasPermission(['project:vault:all'], 'vault:delete')).toBe(true);
  });

  it('matches an N-segment wildcard grant against a narrower same-resource check', () => {
    expect(
      CanCanService.hasPermission(['organization:projects:all'], 'organization:projects:read'),
    ).toBe(true);
    expect(
      CanCanService.hasPermission(['project:vault:secrets:all'], 'project:vault:secrets:read'),
    ).toBe(true);
    expect(
      CanCanService.hasPermission(['organization:projects:all'], 'organization:users:read'),
    ).toBe(false);
    expect(
      CanCanService.hasPermission(['organization:projects:read'], 'organization:projects:all'),
    ).toBe(false);
  });

  it('allows a cluster admin without organization or project access rows', async () => {
    userRepository.rows.set(
      'jose',
      user({ id: 'jose', role: role({ id: 'admin', slug: 'admin' }) }),
    );

    await expect(
      service.can('jose', 'stateiac:delete', { scope: 'project', projectId: 'kettu' }),
    ).resolves.toBe(true);
  });

  it('allows an organization role inside that organization', async () => {
    userRepository.rows.set('jose', user({ id: 'jose', role: null }));
    userAccessRepository.rows.push(
      access({
        id: 'access-1',
        userId: 'jose',
        scope: 'organization',
        organizationId: 'gitops',
        role: role({
          id: 'developer',
          slug: 'developer',
          scope: 'organization',
          permissions: ['stateiac:read'],
        }),
      }),
    );

    await expect(
      service.can('jose', 'stateiac:read', { scope: 'organization', organizationId: 'gitops' }),
    ).resolves.toBe(true);
    await expect(
      service.can('jose', 'stateiac:read', { scope: 'organization', organizationId: 'other' }),
    ).resolves.toBe(false);
  });

  it('inherits organization access for projects in that organization', async () => {
    userRepository.rows.set('jose', user({ id: 'jose', role: null }));
    projectLookup.organizationsByProjectId.set('kettu', 'gitops');
    userAccessRepository.rows.push(
      access({
        id: 'access-1',
        userId: 'jose',
        scope: 'organization',
        organizationId: 'gitops',
        role: role({
          id: 'developer',
          slug: 'developer',
          scope: 'organization',
          permissions: ['stateiac:read'],
        }),
      }),
    );

    await expect(
      service.can('jose', 'stateiac:read', { scope: 'project', projectId: 'kettu' }),
    ).resolves.toBe(true);
  });

  it('allows a project-specific admin role only for that project', async () => {
    userRepository.rows.set('jose', user({ id: 'jose', role: null }));
    userAccessRepository.rows.push(
      access({
        id: 'access-1',
        userId: 'jose',
        scope: 'project',
        projectId: 'kettu',
        role: role({ id: 'project-admin', slug: 'project-admin', scope: 'project' }),
      }),
    );

    await expect(
      service.can('jose', 'stateiac:delete', { scope: 'project', projectId: 'kettu' }),
    ).resolves.toBe(true);
    await expect(
      service.can('jose', 'stateiac:delete', { scope: 'project', projectId: 'other' }),
    ).resolves.toBe(false);
  });

  it('denies scoped access when the user has no matching access row', async () => {
    userRepository.rows.set(
      'jose',
      user({
        id: 'jose',
        role: role({ id: 'cluster-user', slug: 'cluster-user', permissions: ['stateiac:read'] }),
      }),
    );

    await expect(
      service.can('jose', 'stateiac:read', { scope: 'organization', organizationId: 'gitops' }),
    ).resolves.toBe(false);
    await expect(service.can('jose', 'stateiac:read', { scope: 'cluster' })).resolves.toBe(true);
  });

  describe('organization role authority cascades into its projects', () => {
    it('lets organization:projects:<action> satisfy the matching project:* check', async () => {
      userRepository.rows.set('jose', user({ id: 'jose', role: null }));
      projectLookup.organizationsByProjectId.set('kettu', 'gitops');
      userAccessRepository.rows.push(
        access({
          id: 'access-1',
          userId: 'jose',
          scope: 'organization',
          organizationId: 'gitops',
          role: role({
            id: 'org-developer',
            slug: 'org-developer',
            scope: 'organization',
            permissions: ['organization:projects:read', 'organization:projects:update'],
          }),
        }),
      );

      await expect(
        service.can('jose', 'project:project:read', { scope: 'project', projectId: 'kettu' }),
      ).resolves.toBe(true);
      await expect(
        service.can('jose', 'project:vault:secrets:read', { scope: 'project', projectId: 'kettu' }),
      ).resolves.toBe(true);
      await expect(
        service.can('jose', 'project:project:update', { scope: 'project', projectId: 'kettu' }),
      ).resolves.toBe(true);
      // org-developer has no organization:projects:delete grant, so nothing project-scoped
      // that maps to "delete" should be authorized either
      await expect(
        service.can('jose', 'project:project:delete', { scope: 'project', projectId: 'kettu' }),
      ).resolves.toBe(false);
    });

    it('organization:projects:all satisfies every action inside the org projects', async () => {
      userRepository.rows.set('jose', user({ id: 'jose', role: null }));
      projectLookup.organizationsByProjectId.set('kettu', 'gitops');
      userAccessRepository.rows.push(
        access({
          id: 'access-1',
          userId: 'jose',
          scope: 'organization',
          organizationId: 'gitops',
          role: role({
            id: 'custom-org-role',
            slug: 'custom-org-role',
            scope: 'organization',
            permissions: ['organization:projects:all'],
          }),
        }),
      );

      await expect(
        service.can('jose', 'project:roles:delete', { scope: 'project', projectId: 'kettu' }),
      ).resolves.toBe(true);
    });

    it('does not let unrelated organization permissions leak into project checks', async () => {
      userRepository.rows.set('jose', user({ id: 'jose', role: null }));
      projectLookup.organizationsByProjectId.set('kettu', 'gitops');
      userAccessRepository.rows.push(
        access({
          id: 'access-1',
          userId: 'jose',
          scope: 'organization',
          organizationId: 'gitops',
          role: role({
            id: 'org-users-manager',
            slug: 'org-users-manager',
            scope: 'organization',
            permissions: ['organization:users:all'],
          }),
        }),
      );

      await expect(
        service.can('jose', 'project:project:read', { scope: 'project', projectId: 'kettu' }),
      ).resolves.toBe(false);
    });
  });

  describe('canManageOrganization / canViewOrganization', () => {
    it('admits an organization-scope role, regardless of its permissions', async () => {
      const jose = user({ id: 'jose', role: null });
      userAccessRepository.rows.push(
        access({
          id: 'access-1',
          userId: 'jose',
          scope: 'organization',
          organizationId: 'gitops',
          role: role({ id: 'org-developer', slug: 'org-developer', scope: 'organization' }),
        }),
      );

      await expect(service.canManageOrganization(jose, 'gitops')).resolves.toBe(true);
      await expect(service.canViewOrganization(jose, 'gitops')).resolves.toBe(true);
    });

    it('does not let a project-only user manage the parent organization', async () => {
      const jose = user({ id: 'jose', role: null });
      userAccessRepository.rows.push(
        access({
          id: 'access-1',
          userId: 'jose',
          scope: 'project',
          projectId: 'kettu',
          project: { id: 'kettu', organizationId: 'gitops' },
          role: role({ id: 'project-viewer', slug: 'project-viewer', scope: 'project' }),
        }),
      );

      await expect(service.canManageOrganization(jose, 'gitops')).resolves.toBe(false);
    });

    it('lets a project-only user view (not manage) the parent organization', async () => {
      const jose = user({ id: 'jose', role: null });
      userAccessRepository.rows.push(
        access({
          id: 'access-1',
          userId: 'jose',
          scope: 'project',
          projectId: 'kettu',
          project: { id: 'kettu', organizationId: 'gitops' },
          role: role({ id: 'project-viewer', slug: 'project-viewer', scope: 'project' }),
        }),
      );

      await expect(service.canViewOrganization(jose, 'gitops')).resolves.toBe(true);
      await expect(service.canViewOrganization(jose, 'other-org')).resolves.toBe(false);
    });

    it('denies a user with no access rows at all', async () => {
      const jose = user({ id: 'jose', role: null });
      await expect(service.canManageOrganization(jose, 'gitops')).resolves.toBe(false);
      await expect(service.canViewOrganization(jose, 'gitops')).resolves.toBe(false);
    });
  });

  describe('organizationIdsForUser', () => {
    it('returns null for a cluster admin (no restriction)', async () => {
      const jose = user({ id: 'jose', role: role({ id: 'admin', slug: 'admin' }) });
      await expect(service.organizationIdsForUser(jose)).resolves.toBeNull();
    });

    it('returns an empty list for a user with no access rows', async () => {
      const jose = user({ id: 'jose', role: null });
      await expect(service.organizationIdsForUser(jose)).resolves.toEqual([]);
    });

    it('collects organizations from direct organization access', async () => {
      const jose = user({ id: 'jose', role: null });
      userAccessRepository.rows.push(
        access({
          id: 'access-1',
          userId: 'jose',
          scope: 'organization',
          organizationId: 'gitops',
          role: role({ id: 'org-developer', slug: 'org-developer', scope: 'organization' }),
        }),
      );

      await expect(service.organizationIdsForUser(jose)).resolves.toEqual(['gitops']);
    });

    it('collects the parent organization from project access, deduplicated', async () => {
      const jose = user({ id: 'jose', role: null });
      userAccessRepository.rows.push(
        access({
          id: 'access-1',
          userId: 'jose',
          scope: 'project',
          projectId: 'kettu',
          project: { id: 'kettu', organizationId: 'gitops' },
          role: role({ id: 'project-admin', slug: 'project-admin', scope: 'project' }),
        }),
        access({
          id: 'access-2',
          userId: 'jose',
          scope: 'organization',
          organizationId: 'gitops',
          role: role({ id: 'org-developer', slug: 'org-developer', scope: 'organization' }),
        }),
      );

      await expect(service.organizationIdsForUser(jose)).resolves.toEqual(['gitops']);
    });
  });
});
