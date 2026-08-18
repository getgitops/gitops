import {  RoleEntity } from '$lib/database/schemas';
import type { RoleView } from '../../domain/entities';
import { Repository } from './repository';

export class RoleRepository extends Repository {

  async findByName(name: string): Promise<RoleView | null> {
    const role = await this.db.select().from(RoleEntity).where({ name }).limit(1);
    return role.rows[0] as RoleView | undefined || null;
  }
}