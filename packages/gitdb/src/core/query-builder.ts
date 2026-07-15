import type { EntityRecord, JsonValue, Predicate } from '../domain/types';
import { FileManager } from '../infrastructure/file-manager';

export class QueryBuilder<T extends EntityRecord> {
  private readonly predicates: Array<Predicate<T>> = [];

  constructor(
    private readonly fileManager: FileManager,
    private readonly entityName: string,
    private readonly idField: string,
  ) {}

  where(criteria: Partial<T> | Predicate<T>): QueryBuilder<T> {
    if (typeof criteria === 'function') {
      this.predicates.push(criteria);
      return this;
    }

    this.predicates.push((item) => {
      return Object.entries(criteria).every(([key, value]) => item[key] === value);
    });

    return this;
  }

  async all(): Promise<T[]> {
    const rows = await this.fileManager.readEntityRows<T>(this.entityName);
    if (!this.predicates.length) {
      return rows;
    }

    return rows.filter((item) => this.predicates.every((predicate) => predicate(item)));
  }

  async first(): Promise<T | null> {
    const rows = await this.all();
    return rows[0] ?? null;
  }

  async findById(id: JsonValue): Promise<T | null> {
    return this.where({ [this.idField]: id } as Partial<T>).first();
  }

  async findBy(criteria: Partial<T>): Promise<T | null> {
    return this.where(criteria).first();
  }
}
