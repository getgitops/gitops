import crypto from 'crypto';
import { isValidPermissionGrant, normalizePermissionGrants } from '$lib/permissions';
import type { RoleRepository } from '../infrastructure/repositories/role.repository';
import type { UserRepository } from '../infrastructure/repositories/user.repository';
import type { RoleScope } from '../domain/role.domain';

const ORGANIZATION_ADMIN_PERMISSIONS = [
  'organization:projects:all',
  'organization:users:all',
  'organization:roles:all',
  'organization:backups:all',
  'organization:server-keys:all',
  'organization:audit:all',
];

const ORGANIZATION_DEVELOPER_PERMISSIONS = [
  'organization:projects:read',
  'organization:projects:create',
  'organization:projects:update',
];

const PROJECT_ADMIN_PERMISSIONS = [
  'project:project:all',
  'project:users:all',
  'project:roles:all',
  'project:server-keys:all',
  'project:audit:all',
  'project:vault:secrets:all',
  'project:vault:environments:all',
  'project:codereport:reports:all',
  'project:codereport:dependencies:all',
  'project:codereport:vulnerabilities:all',
  'project:stateiac:stacks:all',
  'project:stateiac:states:all',
  'project:stateiac:history:all',
];

const PROJECT_DEVELOPER_PERMISSIONS = [
  'project:vault:secrets:read',
  'project:vault:secrets:create',
  'project:vault:secrets:update',
  'project:vault:environments:read',
  'project:vault:environments:create',
  'project:vault:environments:update',
  'project:codereport:reports:read',
  'project:codereport:reports:create',
  'project:codereport:reports:update',
  'project:codereport:dependencies:read',
  'project:codereport:dependencies:create',
  'project:codereport:dependencies:update',
  'project:codereport:vulnerabilities:read',
  'project:codereport:vulnerabilities:create',
  'project:codereport:vulnerabilities:update',
  'project:stateiac:stacks:read',
  'project:stateiac:stacks:create',
  'project:stateiac:stacks:update',
  'project:stateiac:states:read',
  'project:stateiac:states:create',
  'project:stateiac:states:update',
  'project:stateiac:history:read',
  'project:stateiac:history:create',
  'project:stateiac:history:update',
];

const PROJECT_VIEWER_PERMISSIONS = [
  'project:project:read',
  'project:users:read',
  'project:roles:read',
  'project:server-keys:read',
  'project:audit:read',
  'project:vault:secrets:read',
  'project:vault:environments:read',
  'project:codereport:reports:read',
  'project:codereport:dependencies:read',
  'project:codereport:vulnerabilities:read',
  'project:stateiac:stacks:read',
  'project:stateiac:states:read',
  'project:stateiac:history:read',
];

export class RoleService {
  constructor(
    private readonly roleRepository: Pick<
      RoleRepository,
      'findAll' | 'findById' | 'findBySlug' | 'create' | 'update' | 'deleteById'
    >,
    private readonly userRepository: Pick<UserRepository, 'countByRoleId'>,
  ) {}

  async listRoles(scope: RoleScope = 'cluster', scopeId?: string): Promise<any[]> {
    this.validateScope(scope, scopeId);
    const roles = await this.roleRepository.findAll(scope, scopeId);
    return roles
      .filter((role) => {
        if (role.scope !== scope) return false;
        if (scope === 'organization') return role.organizationId === scopeId;
        if (scope === 'project') return role.projectId === scopeId;
        return true;
      })
      .map((role) => role.toJson());
  }

  async createRole(input: {
    name: string;
    slug: string;
    permissions: string[];
    scope?: RoleScope;
    organizationId?: string;
    projectId?: string;
  }): Promise<any> {
    const scope = input.scope ?? 'cluster';
    this.validateScope(scope, scope === 'organization' ? input.organizationId : input.projectId);
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();

    if (!name) {
      throw new Error('Role name is required');
    }

    if (!slug) {
      throw new Error('Role slug is required');
    }

    const scopeId =
      scope === 'organization'
        ? input.organizationId
        : scope === 'project'
          ? input.projectId
          : undefined;
    const existing = await this.roleRepository.findBySlug(slug, scope, scopeId);
    if (existing) {
      throw new Error('A role with this slug already exists');
    }

    const permissions = this.sanitizePermissions(input.permissions, scope);
    const organizationId = scope === 'organization' ? input.organizationId : null;
    const projectId = scope === 'project' ? input.projectId : null;

    await this.roleRepository.create({
      id: crypto.randomUUID(),
      slug,
      name,
      scope,
      organizationId,
      projectId,
      permissions,
    });

    const created = await this.roleRepository.findBySlug(slug, scope, scopeId);
    if (!created) {
      throw new Error('Failed to create role');
    }

    return created.toJson();
  }

  // called right after an organization is created, so it always has its base roles
  async createDefaultOrganizationRoles(organizationId: string): Promise<void> {
    await this.createRole({
      name: 'Org Admin',
      slug: 'org-admin',
      scope: 'organization',
      organizationId,
      permissions: ORGANIZATION_ADMIN_PERMISSIONS,
    });

    await this.createRole({
      name: 'Org Developer',
      slug: 'org-developer',
      scope: 'organization',
      organizationId,
      permissions: ORGANIZATION_DEVELOPER_PERMISSIONS,
    });
  }

  // called right after a project is created, so it always has its base roles
  async createDefaultProjectRoles(projectId: string): Promise<void> {
    await this.createRole({
      name: 'Project Admin',
      slug: 'project-admin',
      scope: 'project',
      projectId,
      permissions: PROJECT_ADMIN_PERMISSIONS,
    });

    await this.createRole({
      name: 'Project Developer',
      slug: 'project-developer',
      scope: 'project',
      projectId,
      permissions: PROJECT_DEVELOPER_PERMISSIONS,
    });

    await this.createRole({
      name: 'Project Viewer',
      slug: 'project-viewer',
      scope: 'project',
      projectId,
      permissions: PROJECT_VIEWER_PERMISSIONS,
    });
  }

  async updateRole(id: string, changes: { name?: string; permissions?: string[] }): Promise<any> {
    const role = await this.roleRepository.findById(id);
    if (!role) {
      throw new Error('Role not found');
    }

    const patch: { name?: string; permissions?: string[] } = {};

    if (changes.name !== undefined) {
      const name = changes.name.trim();
      if (!name) {
        throw new Error('Role name is required');
      }
      patch.name = name;
    }

    if (changes.permissions !== undefined) {
      patch.permissions = this.sanitizePermissions(changes.permissions, role.scope);
    }

    await this.roleRepository.update(id, patch);

    const updated = await this.roleRepository.findById(id);
    if (!updated) {
      throw new Error('Failed to update role');
    }

    return updated.toJson();
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.roleRepository.findById(id);
    if (!role) {
      throw new Error('Role not found');
    }

    if (role.slug === 'admin') {
      throw new Error('Cannot delete the built-in admin role.');
    }

    const usersWithRole = await this.userRepository.countByRoleId(id);
    if (usersWithRole > 0) {
      throw new Error('Cannot delete a role that is assigned to existing users.');
    }

    await this.roleRepository.deleteById(id);
  }

  private sanitizePermissions(permissions: string[], scope: RoleScope): string[] {
    const canonical = normalizePermissionGrants(permissions, scope);
    const invalid = canonical.filter((permission) => !isValidPermissionGrant(permission));

    if (invalid.length) {
      throw new Error(`Invalid permission(s): ${invalid.join(', ')}`);
    }

    return canonical;
  }

  private validateScope(scope?: RoleScope, scopeId?: string): void {
    if (!scope || !['cluster', 'organization', 'project'].includes(scope)) {
      throw new Error('Role scope must be cluster, organization, or project');
    }

    if (scope !== 'cluster' && !scopeId?.trim()) {
      throw new Error(`A ${scope} role requires its ID`);
    }
  }
}
