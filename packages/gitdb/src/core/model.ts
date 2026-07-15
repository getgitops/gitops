import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EntityRecord, JsonValue, Predicate } from '../domain/types';
import { GitRepository } from '../infrastructure/git-repository';
import { QueryBuilder } from './query-builder';

export class GitDBModel<T extends EntityRecord> {
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly filePath: string;

  constructor(
    private readonly repository: GitRepository,
    private readonly repositoryPath: string,
    private readonly entityName: string,
    public readonly idField: string,
  ) {
    this.filePath = path.join(repositoryPath, `${entityName}.json`);
  }

  select(): QueryBuilder<T> {
    return new QueryBuilder<T>(this);
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

    await this.enqueueWrite(async () => {
      const rows = await this.readAll();
      rows.push(inserted);
      await this.writeAll(rows);
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

    await this.enqueueWrite(async () => {
      const rows = await this.readAll();
      rows.push(...inserted);
      await this.writeAll(rows);
    });

    this.repository.queueBackgroundCommit(`insertMany:${this.entityName}`);
    return inserted;
  }

  async readAll(): Promise<T[]> {
    await this.ensureEntityFile();
    const content = await readFile(this.filePath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`Entity file ${this.entityName}.json must contain a JSON array`);
    }

    return parsed as T[];
  }

  private async writeAll(rows: T[]): Promise<void> {
    await writeFile(this.filePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  }

  private async ensureEntityFile(): Promise<void> {
    if (existsSync(this.filePath)) {
      return;
    }

    await writeFile(this.filePath, '[]\n', 'utf8');
  }

  private enqueueWrite(task: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(task);
    return this.writeQueue;
  }
}
