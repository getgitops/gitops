import { RoleEntity } from '$lib/database/schemas';
import type { RoleView } from '../../domain/entities';
import { RoleDomain, type RoleScope } from '../../domain/role.domain';
import { Repository } from './repository';

export class RoleRepository extends Repository {
  async findByName(name: string): Promise<RoleView | null> {
    const role = await this.db.select().from(RoleEntity).where({ name }).limit(1);
    return (role.rows[0] as RoleView | undefined) || null;
  }

  async findAll(scope?: RoleScope, scopeId?: string): Promise<RoleDomain[]> {
    const result = await this.db
      .with({ organization: true, project: true })
      .select()
      .from(RoleEntity)
      .orderBy('createdAt', 'asc');
    return result.rows
      .map((row: any) => new RoleDomain(row))
      .filter((role) => {
        if (!scope) return true;
        if (role.scope !== scope) return false;
        if (scope === 'organization') return role.organizationId === scopeId;
        if (scope === 'project') return role.projectId === scopeId;
        return true;
      });
  }

  async findById(id: string): Promise<RoleDomain | null> {
    const result = await this.db
      .with({ organization: true, project: true })
      .select()
      .from(RoleEntity)
      .where({ id })
      .limit(1);
    const row = result.rows[0];
    return row ? new RoleDomain(row) : null;
  }

  async findBySlug(slug: string, scope?: RoleScope, scopeId?: string): Promise<RoleDomain | null> {
    const result = await this.db
      .with({ organization: true, project: true })
      .select()
      .from(RoleEntity)
      .where({ slug });
    const roles = result.rows.map((row: any) => new RoleDomain(row));
    return (
      roles.find((role) => {
        if (!scope) return true;
        if (role.scope !== scope) return false;
        if (scope === 'organization') return role.organizationId === scopeId;
        if (scope === 'project') return role.projectId === scopeId;
        return true;
      }) ?? null
    );
  }

  async create(input: {
    id: string;
    slug: string;
    name: string;
    scope: RoleScope;
    organizationId?: string | null;
    projectId?: string | null;
    permissions: string[];
  }): Promise<void> {
    await this.db.insert(RoleEntity).values({
      id: input.id,
      slug: input.slug,
      name: input.name,
      scope: input.scope,
      organizationId: input.organizationId ?? null,
      projectId: input.projectId ?? null,
      permissions: input.permissions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async update(id: string, changes: { name?: string; permissions?: string[] }): Promise<void> {
    await this.db
      .update(RoleEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(RoleEntity).where({ id });
  }
}
