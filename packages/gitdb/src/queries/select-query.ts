import type { EntityDefinition } from '../core/schema.ts';

export type WhereClause = Record<string, unknown>;

export type OrderByDirection = 'asc' | 'desc';

export type OrderByClause = {
  field: string;
  direction: OrderByDirection;
};

export type SelectQueryState = {
  from?: EntityDefinition;
  where: WhereClause[];
  orderBy: OrderByClause[];
  limit?: number;
  offset?: number;
};

export type SelectExecutionResult = {
  sql: string;
  params: unknown[];
  rows: unknown[];
  state: SelectQueryState;
};

export class SelectQuery implements PromiseLike<SelectExecutionResult> {
  private readonly state: SelectQueryState = {
    where: [],
    orderBy: [],
  };

  from(entity: EntityDefinition): this {
    this.state.from = entity;
    return this;
  }

  where(condition: WhereClause): this {
    this.state.where.push(condition);
    return this;
  }

  orderBy(field: string, direction: OrderByDirection = 'asc'): this {
    this.state.orderBy.push({ field, direction });
    return this;
  }

  limit(value: number): this {
    this.state.limit = value;
    return this;
  }

  offset(value: number): this {
    this.state.offset = value;
    return this;
  }

  async execute(): Promise<SelectExecutionResult> {
    if (!this.state.from) {
      throw new Error('select().from(...) is required before execute()');
    }

    const sqlParts: string[] = [`SELECT * FROM ${this.state.from.name}`];
    const params: unknown[] = [];

    if (this.state.where.length) {
      const whereChunks: string[] = [];

      for (const condition of this.state.where) {
        for (const [field, value] of Object.entries(condition)) {
          whereChunks.push(`${field} = ?`);
          params.push(value);
        }
      }

      if (whereChunks.length) {
        sqlParts.push(`WHERE ${whereChunks.join(' AND ')}`);
      }
    }

    if (this.state.orderBy.length) {
      const orderByValue = this.state.orderBy
        .map((entry) => `${entry.field} ${entry.direction.toUpperCase()}`)
        .join(', ');
      sqlParts.push(`ORDER BY ${orderByValue}`);
    }

    if (this.state.limit !== undefined) {
      sqlParts.push('LIMIT ?');
      params.push(this.state.limit);
    }

    if (this.state.offset !== undefined) {
      sqlParts.push('OFFSET ?');
      params.push(this.state.offset);
    }

    return {
      sql: sqlParts.join(' '),
      params,
      rows: [],
      state: this.toJSON(),
    };
  }

  then<TResult1 = SelectExecutionResult, TResult2 = never>(
    onfulfilled?: ((value: SelectExecutionResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<SelectExecutionResult | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<SelectExecutionResult> {
    return this.execute().finally(onfinally ?? undefined);
  }

  toJSON(): SelectQueryState {
    return {
      from: this.state.from,
      where: [...this.state.where],
      orderBy: [...this.state.orderBy],
      limit: this.state.limit,
      offset: this.state.offset,
    };
  }

  reset(): this {
    this.state.from = undefined;
    this.state.where = [];
    this.state.orderBy = [];
    this.state.limit = undefined;
    this.state.offset = undefined;
    return this;
  }
}
