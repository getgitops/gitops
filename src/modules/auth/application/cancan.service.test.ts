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
}) {
  return new UserAccessDomain({
    id: input.id,
    userId: input.userId,
    roleId: input.role.id,
    role: input.role,
    scope: input.scope,
    organizationId: input.organizationId,
    projectId: input.projectId,
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
});
