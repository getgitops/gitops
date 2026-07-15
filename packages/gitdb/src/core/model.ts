import { randomUUID } from 'node:crypto';
import type { EntityRecord, JsonValue, Predicate } from '../domain/types';
import { FileManager } from '../infrastructure/file-manager';
import { GitRepository } from '../infrastructure/git-repository';
import { AsyncTaskQueue } from './async-task-queue';
import { QueryBuilder } from './query-builder';

export class GitDBModel<T extends EntityRecord> {
  private readonly writeQueue = new AsyncTaskQueue();

  constructor(
    private readonly repository: GitRepository,
    private readonly fileManager: FileManager,
    private readonly entityName: string,
    public readonly idField: string,
  ) {}

  select(): QueryBuilder<T> {
    return new QueryBuilder<T>(this.fileManager, this.entityName, this.idField);
  }

  where(criteria: Partial<T> | Predicate<T>): QueryBuilder<T> {
    return this.select().where(criteria);
  }

  findById(id: JsonValue): Promise<T | null> {
    return this.select().findById(id);
  }

  findBy(criteria: Partial<T>): Promise<T | null> {
    return this.select().findBy(criteria);
  }

  async insert(data: T): Promise<T> {
    const inserted = { ...data } as T;
    const insertedRecord = inserted as Record<string, JsonValue>;
    if (insertedRecord[this.idField] === undefined || insertedRecord[this.idField] === null) {
      insertedRecord[this.idField] = randomUUID();
    }

    await this.writeQueue.enqueue(async () => {
      const rows = await this.fileManager.readEntityRows<T>(this.entityName);
      rows.push(inserted);
      await this.fileManager.writeEntityRows<T>(this.entityName, rows);
    });

    this.repository.queueBackgroundCommit(`insert:${this.entityName}`);
    return inserted;
  }

  async insertMany(data: T[]): Promise<T[]> {
    const inserted = data.map((item) => {
      const row = { ...item } as T;
      const rowRecord = row as Record<string, JsonValue>;
      if (rowRecord[this.idField] === undefined || rowRecord[this.idField] === null) {
        rowRecord[this.idField] = randomUUID();
      }
      return row;
    });

    await this.writeQueue.enqueue(async () => {
      const rows = await this.fileManager.readEntityRows<T>(this.entityName);
      rows.push(...inserted);
      await this.fileManager.writeEntityRows<T>(this.entityName, rows);
    });

    this.repository.queueBackgroundCommit(`insertMany:${this.entityName}`);
    return inserted;
  }
}
