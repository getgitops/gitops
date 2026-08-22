import { describe, expect, it, beforeEach } from 'vitest';
import { RoleService } from './role.service';
import { RoleDomain } from '../domain/role.domain';

class FakeRoleRepository {
  rows: RoleDomain[] = [];

  async findAll() {
    return [...this.rows];
  }

  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async findBySlug(slug: string) {
    return this.rows.find((r) => r.slug === slug) ?? null;
  }

  async create(input: { id: string; slug: string; name: string; permissions: string[] }) {
    this.rows.push(
      new RoleDomain({
        id: input.id,
        slug: input.slug,
        name: input.name,
        scope: (input as any).scope,
        organizationId: (input as any).organizationId,
        projectId: (input as any).projectId,
        permissions: input.permissions,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
    );
  }

  async update(id: string, changes: { name?: string; permissions?: string[] }) {
    const role = this.rows.find((r) => r.id === id);
    if (!role) return;
    if (changes.name !== undefined) role.name = changes.name;
    if (changes.permissions !== undefined) role.permissions = changes.permissions;
  }

  async deleteById(id: string) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

class FakeUserRepository {
  roleIdCounts = new Map<string, number>();

  async countByRoleId(roleId: string) {
    return this.roleIdCounts.get(roleId) ?? 0;
  }
}

describe('RoleService', () => {
  let roleRepository: FakeRoleRepository;
  let userRepository: FakeUserRepository;
  let service: RoleService;

  beforeEach(async () => {
    roleRepository = new FakeRoleRepository();
    userRepository = new FakeUserRepository();
    service = new RoleService(roleRepository as any, userRepository as any);

    await roleRepository.create({
      id: 'admin-id',
      slug: 'admin',
      name: 'Administrator',
      permissions: ['vault:all', 'openreport:all', 'stateiac:all'],
    });
    userRepository.roleIdCounts.set('admin-id', 1);
  });

  it('lists roles', async () => {
    const roles = await service.listRoles();
    expect(roles).toHaveLength(1);
    expect(roles[0].slug).toBe('admin');
  });

  it('lists only roles owned by the requested organization', async () => {
    await service.createRole({
      name: 'Organization role',
      slug: 'organization-role',
      permissions: [],
      scope: 'organization',
      organizationId: 'org-1',
    });
    await service.createRole({
      name: 'Other organization role',
      slug: 'other-organization-role',
      permissions: [],
      scope: 'organization',
      organizationId: 'org-2',
    });
    await service.createRole({
      name: 'Project role',
      slug: 'project-role',
      permissions: [],
      scope: 'project',
      projectId: 'project-1',
    });

    const roles = await service.listRoles('organization', 'org-1');

    expect(roles.map((role) => role.slug)).toEqual(['organization-role']);
  });

  it('requires an owner ID for organization and project roles', async () => {
    await expect(
      service.createRole({
        name: 'Organization role',
        slug: 'org-role',
        permissions: [],
        scope: 'organization',
      }),
    ).rejects.toThrow(/organization role requires its ID/);
    await expect(
      service.createRole({
        name: 'Project role',
        slug: 'project-role',
        permissions: [],
        scope: 'project',
      }),
    ).rejects.toThrow(/project role requires its ID/);
  });

  it('creates a role accepting the section:all shortcut', async () => {
    const role = await service.createRole({
      name: 'Auditor',
      slug: 'auditor',
      permissions: ['vault:all'],
    });

    expect(role.slug).toBe('auditor');
    expect(role.permissions).toEqual(['vault:all']);
  });

  it('creates a role with explicit per-section, per-action permissions', async () => {
    const role = await service.createRole({
      name: 'Developer',
      slug: 'developer',
      permissions: ['vault:read', 'vault:create', 'vault:update'],
    });

    expect(role.permissions.sort()).toEqual(['vault:create', 'vault:read', 'vault:update'].sort());
  });

  it('rejects an invalid permission string', async () => {
    await expect(
      service.createRole({ name: 'Bad', slug: 'bad', permissions: ['vault:frobnicate'] }),
    ).rejects.toThrow(/Invalid permission/);
  });

  it('rejects creating a role with a duplicate slug', async () => {
    await expect(
      service.createRole({ name: 'Second Admin', slug: 'admin', permissions: [] }),
    ).rejects.toThrow(/already exists/);
  });

  it('updates only the fields provided', async () => {
    const created = await service.createRole({
      name: 'Auditor',
      slug: 'auditor',
      permissions: ['vault:read'],
    });

    const updated = await service.updateRole(created.id, { permissions: ['vault:all'] });
    expect(updated.name).toBe('Auditor');
    expect(updated.permissions).toEqual(['vault:all']);

    const renamed = await service.updateRole(created.id, { name: 'Lead Auditor' });
    expect(renamed.name).toBe('Lead Auditor');
    expect(renamed.permissions).toEqual(['vault:all']);
  });

  it('blocks deleting the built-in admin role', async () => {
    await expect(service.deleteRole('admin-id')).rejects.toThrow(/admin role/);
  });

  it('blocks deleting a role assigned to existing users', async () => {
    const created = await service.createRole({ name: 'Auditor', slug: 'auditor', permissions: [] });
    userRepository.roleIdCounts.set(created.id, 2);

    await expect(service.deleteRole(created.id)).rejects.toThrow(/assigned to existing users/);
  });

  it('deletes a role with no users assigned', async () => {
    const created = await service.createRole({ name: 'Auditor', slug: 'auditor', permissions: [] });

    await service.deleteRole(created.id);

    const roles = await service.listRoles();
    expect(roles.find((r) => r.id === created.id)).toBeUndefined();
  });
});
