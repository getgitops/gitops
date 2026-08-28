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

  it('matches canonical grants and resource:all shortcuts', () => {
    expect(CanCanService.hasPermission([], 'project:vault:secrets:read')).toBe(false);
    expect(CanCanService.hasPermission(null, 'project:vault:secrets:read')).toBe(false);
    expect(CanCanService.hasPermission(undefined, 'project:vault:secrets:read')).toBe(false);
    expect(
      CanCanService.hasPermission(['project:vault:secrets:read'], 'project:vault:secrets:read'),
    ).toBe(true);
    expect(
      CanCanService.hasPermission(['project:vault:secrets:read'], 'project:vault:secrets:delete'),
    ).toBe(false);
    expect(
      CanCanService.hasPermission(['project:vault:secrets:all'], 'project:vault:secrets:delete'),
    ).toBe(true);
    expect(
      CanCanService.hasPermission(['project:vault:secrets:all'], 'project:codereport:reports:read'),
    ).toBe(false);
    expect(
      CanCanService.hasPermission(['project:server-keys:all'], 'project:server-keys:read'),
    ).toBe(true);
    expect(CanCanService.hasPermission(['project:server-keys:read'], 'project:roles:read')).toBe(
      false,
    );
  });

  it('upgrades legacy scope-less grants when a role is loaded', () => {
    const legacy = role({
      id: 'legacy',
      slug: 'legacy',
      scope: 'project',
      permissions: ['vault:secrets:read', 'project:all'],
    });

    expect(legacy.permissions).toEqual(['project:vault:secrets:read', 'project:project:all']);
  });

  it('authorizes an api key only inside its own project', () => {
    const apiKey = {
      projectId: 'kettu',
      role: role({
        id: 'role-1',
        slug: 'project-developer',
        scope: 'project',
        permissions: ['project:codereport:reports:create'],
      }),
    };

    expect(
      service.canApiKey(apiKey, 'project:codereport:reports:create', {
        scope: 'project',
        projectId: 'kettu',
      }),
    ).toBe(true);
    expect(
      service.canApiKey(apiKey, 'project:codereport:reports:create', {
        scope: 'project',
        projectId: 'other',
      }),
    ).toBe(false);
    expect(service.canApiKey(apiKey, 'cluster:settings:read', { scope: 'cluster' })).toBe(false);
    expect(
      service.canApiKey(apiKey, 'project:roles:delete', { scope: 'project', projectId: 'kettu' }),
    ).toBe(false);
    expect(
      service.canApiKey(null, 'project:codereport:reports:create', {
        scope: 'project',
        projectId: 'kettu',
      }),
    ).toBe(false);
  });

  it('allows a cluster admin without organization or project access rows', async () => {
    userRepository.rows.set(
      'jose',
      user({ id: 'jose', role: role({ id: 'admin', slug: 'admin' }) }),
    );

    await expect(
      service.can('jose', 'project:project:delete', { scope: 'project', projectId: 'kettu' }),
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
          permissions: ['organization:projects:read'],
        }),
      }),
    );

    await expect(
      service.can('jose', 'organization:projects:read', {
        scope: 'organization',
        organizationId: 'gitops',
      }),
    ).resolves.toBe(true);
    await expect(
      service.can('jose', 'organization:projects:read', {
        scope: 'organization',
        organizationId: 'other',
      }),
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
          permissions: ['organization:projects:read'],
        }),
      }),
    );

    await expect(
      service.can('jose', 'organization:projects:read', {
        scope: 'project',
        projectId: 'kettu',
      }),
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
      service.can('jose', 'project:project:delete', { scope: 'project', projectId: 'kettu' }),
    ).resolves.toBe(true);
    await expect(
      service.can('jose', 'project:project:delete', { scope: 'project', projectId: 'other' }),
    ).resolves.toBe(false);
  });

  it('denies scoped access when the user has no matching access row', async () => {
    userRepository.rows.set(
      'jose',
      user({
        id: 'jose',
        role: role({
          id: 'cluster-user',
          slug: 'cluster-user',
          permissions: ['cluster:projects:read'],
        }),
      }),
    );

    await expect(
      service.can('jose', 'cluster:projects:read', {
        scope: 'organization',
        organizationId: 'gitops',
      }),
    ).resolves.toBe(false);
    await expect(service.can('jose', 'cluster:projects:read', { scope: 'cluster' })).resolves.toBe(
      true,
    );
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
