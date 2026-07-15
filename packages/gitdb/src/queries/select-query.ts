import type { EntityDefinition } from '../core/schema.ts';

export type WhereClause = Record<string, unknown>;
export type EntityRow = Record<string, unknown>;
export type LoadEntityRows = (entityName: string) => Promise<EntityRow[]>;
export type RowPredicate = {
  kind: 'predicate';
  test: (row: EntityRow) => boolean;
  debug: string;
};
export type WhereInput = WhereClause | RowPredicate;

export type OrderByDirection = 'asc' | 'desc';

export type OrderByClause = {
  field: string;
  direction: OrderByDirection;
};

export type SelectQueryState = {
  from?: EntityDefinition;
  where: WhereInput[];
  orderBy: OrderByClause[];
  limit?: number;
  offset?: number;
};

export type SelectExecutionResult = {
  entity: string;
  rows: EntityRow[];
  state: SelectQueryState;
};

function isRowPredicate(input: WhereInput): input is RowPredicate {
  return (
    typeof input === 'object' &&
    input !== null &&
    'kind' in input &&
    (input as { kind?: unknown }).kind === 'predicate' &&
    'test' in input &&
    typeof (input as { test?: unknown }).test === 'function'
  );
}

function toPredicate(input: WhereInput): RowPredicate {
  if (isRowPredicate(input)) {
    return input;
  }

  return {
    kind: 'predicate',
    debug: 'object-equality',
    test: (row) => {
      return Object.entries(input).every(([field, value]) => row[field] === value);
    },
  };
}

function asString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function normalizeIlikePattern(value: string): string {
  return value.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) {
    return 0;
  }

  if (left === undefined || left === null) {
    return -1;
  }

  if (right === undefined || right === null) {
    return 1;
  }

  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function makePredicate(debug: string, test: (row: EntityRow) => boolean): RowPredicate {
  return {
    kind: 'predicate',
    debug,
    test,
  };
}

export function eq(field: string, value: unknown): RowPredicate {
  return makePredicate(`eq(${field})`, (row) => row[field] === value);
}

export function ne(field: string, value: unknown): RowPredicate {
  return makePredicate(`ne(${field})`, (row) => row[field] !== value);
}

export function lt(field: string, value: unknown): RowPredicate {
  return makePredicate(`lt(${field})`, (row) => compareValues(row[field], value) < 0);
}

export function gte(field: string, value: unknown): RowPredicate {
  return makePredicate(`gte(${field})`, (row) => compareValues(row[field], value) >= 0);
}

export function ilike(field: string, pattern: string): RowPredicate {
  const regex = new RegExp(`^${normalizeIlikePattern(pattern)}$`, 'i');
  return makePredicate(`ilike(${field})`, (row) => regex.test(asString(row[field])));
}

export function and(...conditions: WhereInput[]): RowPredicate {
  const predicates = conditions.map((condition) => toPredicate(condition));
  return makePredicate('and(...)', (row) => predicates.every((predicate) => predicate.test(row)));
}

export function or(...conditions: WhereInput[]): RowPredicate {
  const predicates = conditions.map((condition) => toPredicate(condition));
  return makePredicate('or(...)', (row) => predicates.some((predicate) => predicate.test(row)));
}

export function not(condition: WhereInput): RowPredicate {
  const predicate = toPredicate(condition);
  return makePredicate('not(...)', (row) => !predicate.test(row));
}

export class SelectQuery implements PromiseLike<SelectExecutionResult> {
  constructor(private readonly loadEntityRows: LoadEntityRows) {}

  private readonly state: SelectQueryState = {
    where: [],
    orderBy: [],
  };

  from(entity: EntityDefinition): this {
    this.state.from = entity;
    return this;
  }

  where(condition: WhereInput): this {
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

    let rows = await this.loadEntityRows(this.state.from.name);

    if (this.state.where.length) {
      const predicates = this.state.where.map((condition) => toPredicate(condition));
      rows = rows.filter((row) => {
        return predicates.every((predicate) => predicate.test(row));
      });
    }

    if (this.state.orderBy.length) {
      rows = [...rows].sort((left, right) => {
        for (const sort of this.state.orderBy) {
          const leftValue = left[sort.field];
          const rightValue = right[sort.field];

          if (leftValue === rightValue) {
            continue;
          }

          if (leftValue === undefined || leftValue === null) {
            return sort.direction === 'asc' ? -1 : 1;
          }

          if (rightValue === undefined || rightValue === null) {
            return sort.direction === 'asc' ? 1 : -1;
          }

          if (leftValue < rightValue) {
            return sort.direction === 'asc' ? -1 : 1;
          }

          if (leftValue > rightValue) {
            return sort.direction === 'asc' ? 1 : -1;
          }
        }

        return 0;
      });
    }

    if (this.state.offset !== undefined) {
      rows = rows.slice(this.state.offset);
    }

    if (this.state.limit !== undefined) {
      rows = rows.slice(0, this.state.limit);
    }

    return {
      entity: this.state.from.name,
      rows,
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
