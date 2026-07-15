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
  groupBy: string[];
  having: WhereInput[];
  orderBy: OrderByClause[];
  limit?: number;
  offset?: number;
};

export type SelectExecutionResult = {
  entity: string;
  rows: EntityRow[];
  state: SelectQueryState;
};

export type SelectFieldsInput = Record<string, boolean>;

export interface IncludeRelationsMap {
  [relationName: string]: boolean | IncludeRelationsMap;
}
export type IncludeRelationsInput = string[] | IncludeRelationsMap | null;

type IncludeRelationEntry = {
  name: string;
  nestedInclude?: IncludeRelationsInput;
};

type SelectQueryOptions = {
  relationsRegistry?: RelationsRegistry;
  includeRelations?: IncludeRelationsInput;
  selectFields?: SelectFieldsInput;
};

export class SelectQuery implements PromiseLike<SelectExecutionResult> {
  constructor(
    private readonly loadEntityRows: LoadEntityRows,
    private readonly options: SelectQueryOptions = {},
  ) {}

  private readonly state: SelectQueryState = {
    where: [],
    groupBy: [],
    having: [],
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

  groupBy(...fields: string[]): this {
    this.state.groupBy.push(...fields);
    return this;
  }

  having(condition: WhereInput): this {
    this.state.having.push(condition);
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

    if (this.state.having.length && !this.state.groupBy.length) {
      throw new Error('having() requires groupBy(...) before execute()');
    }

    if (this.state.groupBy.length) {
      rows = this.applyGroupBy(rows);

      if (this.state.having.length) {
        const havingPredicates = toPredicates(this.state.having);
        rows = rows.filter((row) => {
          return havingPredicates.every((predicate) => predicate.test(row));
        });
      }
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

    if (!this.state.groupBy.length) {
      rows = await this.hydrateRelations(rows);
    }

    rows = this.applySelectFields(rows);

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
      groupBy: [...this.state.groupBy],
      having: [...this.state.having],
      orderBy: [...this.state.orderBy],
      limit: this.state.limit,
      offset: this.state.offset,
    };
  }

  reset(): this {
    this.state.from = undefined;
    this.state.where = [];
    this.state.groupBy = [];
    this.state.having = [];
    this.state.orderBy = [];
    this.state.limit = undefined;
    this.state.offset = undefined;
    return this;
  }

  private applyGroupBy(rows: EntityRow[]): EntityRow[] {
    const groups = new Map<string, EntityRow[]>();

    for (const row of rows) {
      const keyValues = this.state.groupBy.map((field) => row[field]);
      const key = JSON.stringify(keyValues);
      const existing = groups.get(key);

      if (existing) {
        existing.push(row);
      } else {
        groups.set(key, [row]);
      }
    }

    const groupedRows: EntityRow[] = [];

    for (const grouped of groups.values()) {
      const first = grouped[0];
      if (!first) {
        continue;
      }

      const projected: EntityRow = {
        $count: grouped.length,
      };

      for (const field of this.state.groupBy) {
        projected[field] = first[field];
      }

      groupedRows.push(projected);
    }

    return groupedRows;
  }

  private applySelectFields(rows: EntityRow[]): EntityRow[] {
    const selectFields = this.options.selectFields;
    if (!selectFields) {
      return rows;
    }

    const selected = Object.entries(selectFields)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([field]) => field);

    return rows.map((row) => {
      const projected: EntityRow = {};

      for (const field of selected) {
        if (field in row) {
          projected[field] = row[field];
        }
      }

      return projected;
    });
  }

  private async hydrateRelations(rows: EntityRow[]): Promise<EntityRow[]> {
    const source = this.state.from;
    if (!source || !this.options.relationsRegistry) {
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

    return this.hydrateRowsForEntity(
      rows,
      source.name,
      this.options.includeRelations ?? null,
      getTargetRows,
    );
  }

  private async hydrateRowsForEntity(
    rows: EntityRow[],
    sourceEntity: string,
    includeRelations: IncludeRelationsInput,
    getTargetRows: (entityName: string) => Promise<EntityRow[]>,
  ): Promise<EntityRow[]> {
    const registry = this.options.relationsRegistry;
    if (!registry) {
      return rows;
    }

    const allRelations = registry.get(sourceEntity);
    const selectedRelations = this.resolveIncludedRelations(allRelations, includeRelations)
      .map((entry) => ({
        entry,
        relation: allRelations[entry.name],
      }))
      .filter((item): item is { entry: IncludeRelationEntry; relation: RelationDefinition } => item.relation !== undefined);

    if (!selectedRelations.length) {
      return rows;
    }

    const hydratedRows: EntityRow[] = [];

    for (const row of rows) {
      const hydrated: EntityRow = { ...row };

      for (const { entry, relation } of selectedRelations) {
        const relationResult = await this.resolveRelation(row, relation, getTargetRows);

        if (entry.nestedInclude !== undefined && relationResult !== null) {
          hydrated[entry.name] = await this.hydrateRelationValue(
            relationResult,
            relation.targetEntity,
            entry.nestedInclude,
            getTargetRows,
          );
          continue;
        }

        hydrated[entry.name] = relationResult;
      }

      hydratedRows.push(hydrated);
    }

    return hydratedRows;
  }

  private async hydrateRelationValue(
    relationValue: EntityRow | EntityRow[],
    targetEntity: string,
    includeRelations: IncludeRelationsInput,
    getTargetRows: (entityName: string) => Promise<EntityRow[]>,
  ): Promise<EntityRow | EntityRow[]> {
    if (Array.isArray(relationValue)) {
      return this.hydrateRowsForEntity(relationValue, targetEntity, includeRelations, getTargetRows);
    }

    const [hydrated] = await this.hydrateRowsForEntity(
      [relationValue],
      targetEntity,
      includeRelations,
      getTargetRows,
    );

    return hydrated ?? relationValue;
  }

  private resolveIncludedRelations(
    allRelations: Record<string, RelationDefinition>,
    include: IncludeRelationsInput,
  ): IncludeRelationEntry[] {
    if (!include) {
      return Object.keys(allRelations).map((name) => ({ name }));
    }

    if (Array.isArray(include)) {
      return include.map((name) => ({ name }));
    }

    return Object.entries(include)
      .filter(([, enabled]) => enabled !== false)
      .map(([relationName, enabled]) => {
        if (enabled && typeof enabled === 'object' && !Array.isArray(enabled)) {
          return {
            name: relationName,
            nestedInclude: enabled as IncludeRelationsMap,
          };
        }

        return { name: relationName };
      });
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
