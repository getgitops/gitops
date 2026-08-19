import crypto from 'crypto';
import { isValidPermissionGrant } from '$lib/permissions';
import type { RoleRepository } from '../infrastructure/repositories/role.repository';
import type { UserRepository } from '../infrastructure/repositories/user.repository';

export class RoleService {
  constructor(
    private readonly roleRepository: Pick<
      RoleRepository,
      'findAll' | 'findById' | 'findBySlug' | 'create' | 'update' | 'deleteById'
    >,
    private readonly userRepository: Pick<UserRepository, 'countByRoleId'>,
  ) {}

  async listRoles(): Promise<any[]> {
    const roles = await this.roleRepository.findAll();
    return roles.map((role) => role.toJson());
  }

  async createRole(input: { name: string; slug: string; permissions: string[] }): Promise<any> {
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();

    if (!name) {
      throw new Error('Role name is required');
    }

    if (!slug) {
      throw new Error('Role slug is required');
    }

    const existing = await this.roleRepository.findBySlug(slug);
    if (existing) {
      throw new Error('A role with this slug already exists');
    }

    const permissions = this.sanitizePermissions(input.permissions);

    await this.roleRepository.create({ id: crypto.randomUUID(), slug, name, permissions });

    const created = await this.roleRepository.findBySlug(slug);
    if (!created) {
      throw new Error('Failed to create role');
    }

    return created.toJson();
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
      patch.permissions = this.sanitizePermissions(changes.permissions);
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

  private sanitizePermissions(permissions: string[]): string[] {
    const unique = Array.from(new Set(permissions));
    const invalid = unique.filter((permission) => !isValidPermissionGrant(permission));

    if (invalid.length) {
      throw new Error(`Invalid permission(s): ${invalid.join(', ')}`);
    }

    return unique;
  }
}
