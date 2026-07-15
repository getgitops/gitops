import type { EntityDefinition } from '../core/schema.ts';
import type { RelationDefinition, RelationsRegistry } from '../core/relations.ts';
import type { EntityRow, WhereInput } from './where-operators.ts';
import { toPredicates } from './where-operators.ts';
export { and, eq, gte, ilike, lt, ne, not, or } from './where-operators.ts';

export type LoadEntityRows = (entityName: string) => Promise<EntityRow[]>;

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

type SelectQueryOptions = {
  relationsRegistry?: RelationsRegistry;
  includeRelations?: string[] | Record<string, boolean> | null;
};

export class SelectQuery implements PromiseLike<SelectExecutionResult> {
  constructor(
    private readonly loadEntityRows: LoadEntityRows,
    private readonly options: SelectQueryOptions = {},
  ) {}

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
      const predicates = toPredicates(this.state.where);
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

    rows = await this.hydrateRelations(rows);

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

  private async hydrateRelations(rows: EntityRow[]): Promise<EntityRow[]> {
    const source = this.state.from;
    const registry = this.options.relationsRegistry;

    if (!source || !registry) {
      return rows;
    }

    const allRelations = registry.get(source.name);
    const relationNames = this.resolveIncludedRelations(allRelations);
    const selectedRelations = relationNames
      .map((name) => [name, allRelations[name]] as const)
      .filter(([, relation]) => relation !== undefined);

    if (!selectedRelations.length) {
      return rows;
    }

    const cache = new Map<string, Promise<EntityRow[]>>();
    const getTargetRows = (entityName: string) => {
      const cached = cache.get(entityName);
      if (cached) {
        return cached;
      }

      const loader = this.loadEntityRows(entityName);
      cache.set(entityName, loader);
      return loader;
    };

    const hydratedRows: EntityRow[] = [];

    for (const row of rows) {
      const hydrated: EntityRow = { ...row };

      for (const [relationName, relation] of selectedRelations) {
        hydrated[relationName] = await this.resolveRelation(row, relation, getTargetRows);
      }

      hydratedRows.push(hydrated);
    }

    return hydratedRows;
  }

  private resolveIncludedRelations(allRelations: Record<string, RelationDefinition>): string[] {
    const include = this.options.includeRelations;
    if (!include) {
      return Object.keys(allRelations);
    }

    if (Array.isArray(include)) {
      return include;
    }

    return Object.entries(include)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([relationName]) => relationName);
  }

  private async resolveRelation(
    sourceRow: EntityRow,
    relation: RelationDefinition,
    getTargetRows: (entityName: string) => Promise<EntityRow[]>,
  ): Promise<EntityRow | EntityRow[] | null> {
    if (relation.fields.length === 0 || relation.references.length === 0) {
      return relation.kind === 'many' ? [] : null;
    }

    const targetRows = await getTargetRows(relation.targetEntity);
    const matches = targetRows.filter((targetRow) => {
      return relation.fields.every((field, index) => {
        const sourceValue = sourceRow[field];
        const targetField = relation.references[index];
        const targetValue = targetRow[targetField];
        return sourceValue === targetValue;
      });
    });

    if (relation.kind === 'one') {
      return matches[0] ?? null;
    }

    return matches;
  }
}
