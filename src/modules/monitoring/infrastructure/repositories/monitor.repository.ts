import { Repository } from '#lib/server/infra/repository';
import { MonitorEntity } from '#lib/database/schemas';
import { toMonitorRecord, type MonitorRecord } from '../../domain/monitor.domain';

export type MonitorWrite = Omit<MonitorRecord, 'createdAt' | 'updatedAt'>;

export interface MonitorStore {
  listAll(): Promise<MonitorRecord[]>;
  listByProject(projectId: string): Promise<MonitorRecord[]>;
  findById(id: string): Promise<MonitorRecord | null>;
  create(input: MonitorWrite): Promise<MonitorRecord>;
  update(
    id: string,
    changes: Partial<Omit<MonitorWrite, 'id' | 'projectId'>>,
  ): Promise<MonitorRecord>;
  delete(id: string): Promise<void>;
}

/** Monitor configuration, in the main GitDB. */
export class MonitorRepository extends Repository implements MonitorStore {
  async listAll(): Promise<MonitorRecord[]> {
    const { rows } = await this.db.select().from(MonitorEntity).orderBy('createdAt', 'asc');
    return rows.map(toMonitorRecord);
  }

  async listByProject(projectId: string): Promise<MonitorRecord[]> {
    const { rows } = await this.db
      .select()
      .from(MonitorEntity)
      .where({ projectId })
      .orderBy('createdAt', 'asc');
    return rows.map(toMonitorRecord);
  }

  async findById(id: string): Promise<MonitorRecord | null> {
    const { rows } = await this.db.select().from(MonitorEntity).where({ id }).limit(1);
    return rows[0] ? toMonitorRecord(rows[0]) : null;
  }

  async create(input: MonitorWrite): Promise<MonitorRecord> {
    const now = new Date().toISOString();
    await this.db.insert(MonitorEntity).values({ ...input, createdAt: now, updatedAt: now });
    return (await this.findById(input.id))!;
  }

  async update(
    id: string,
    changes: Partial<Omit<MonitorWrite, 'id' | 'projectId'>>,
  ): Promise<MonitorRecord> {
    await this.db
      .update(MonitorEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
    const updated = await this.findById(id);
    if (!updated) throw new Error('Monitor not found');
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(MonitorEntity).where({ id });
  }
}
