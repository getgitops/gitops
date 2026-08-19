import {  RoleEntity } from '$lib/database/schemas';
import type { RoleView } from '../../domain/entities';
import { RoleDomain } from '../../domain/role.domain';
import { Repository } from './repository';

export class RoleRepository extends Repository {

  async findByName(name: string): Promise<RoleView | null> {
    const role = await this.db.select().from(RoleEntity).where({ name }).limit(1);
    return role.rows[0] as RoleView | undefined || null;
  }

  async findAll(): Promise<RoleDomain[]> {
    const result = await this.db.select().from(RoleEntity).orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new RoleDomain(row));
  }

  async findById(id: string): Promise<RoleDomain | null> {
    const result = await this.db.select().from(RoleEntity).where({ id }).limit(1);
    const row = result.rows[0];
    return row ? new RoleDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<RoleDomain | null> {
    const result = await this.db.select().from(RoleEntity).where({ slug }).limit(1);
    const row = result.rows[0];
    return row ? new RoleDomain(row) : null;
  }

  async create(input: { id: string; slug: string; name: string; permissions: string[] }): Promise<void> {
    await this.db.insert(RoleEntity).values({
      id: input.id,
      slug: input.slug,
      name: input.name,
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