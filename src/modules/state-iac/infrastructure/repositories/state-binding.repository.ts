import { StateBindingEntity } from '#lib/database/schemas';
import { Repository } from '#lib/server/infra/repository';
import { StateBindingDomain, type StateBindingRow } from '../../domain/state-binding.domain';

export type StateBindingChanges = Partial<Pick<StateBindingRow, 'stacks' | 'projectId'>>;

/** Persistence port; `InMemoryStateBindingRepository` implements it in tests. */
export interface StateBindingRepositoryPort {
  findById(id: string): Promise<StateBindingDomain | null>;
  listByBackend(backendId: string): Promise<StateBindingDomain[]>;
  listByOrganization(organizationId: string): Promise<StateBindingDomain[]>;
  listByProject(projectId: string): Promise<StateBindingDomain[]>;
  create(row: StateBindingRow): Promise<void>;
  update(id: string, changes: StateBindingChanges): Promise<void>;
  delete(id: string): Promise<void>;
}

export class StateBindingRepository extends Repository implements StateBindingRepositoryPort {
  async findById(id: string) {
    const result = await this.db.select().from(StateBindingEntity).where({ id }).limit(1);
    const row = result.rows[0];
    return row ? new StateBindingDomain(row) : null;
  }

  private async listWhere(where: Record<string, string>) {
    const result = await this.db
      .select()
      .from(StateBindingEntity)
      .where(where)
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new StateBindingDomain(row));
  }

  listByBackend(backendId: string) {
    return this.listWhere({ backendId });
  }

  listByOrganization(organizationId: string) {
    return this.listWhere({ organizationId });
  }

  listByProject(projectId: string) {
    return this.listWhere({ projectId });
  }

  async create(row: StateBindingRow) {
    await this.db.insert(StateBindingEntity).values({ ...row });
  }

  async update(id: string, changes: StateBindingChanges) {
    await this.db
      .update(StateBindingEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async delete(id: string) {
    await this.db.delete(StateBindingEntity).where({ id });
  }
}
