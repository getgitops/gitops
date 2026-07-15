import type { EntityRecord, JsonValue, Predicate } from '../domain/types';
import type { GitDBModel } from './model';

export class QueryBuilder<T extends EntityRecord> {
  private readonly predicates: Array<Predicate<T>> = [];

  constructor(private readonly model: GitDBModel<T>) {}

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
    const rows = await this.model.readAll();
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
    return this.where({ [this.model.idField]: id } as Partial<T>).first();
  }

  async findBy(criteria: Partial<T>): Promise<T | null> {
    return this.where(criteria).first();
  }
}
