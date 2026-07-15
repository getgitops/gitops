import type { EntityDefinition } from '../core/schema.ts';
import type { EntityRow, WhereInput } from './where-operators.ts';
import { toPredicates } from './where-operators.ts';

export type DeleteExecutionResult = {
  entity: string;
  rowCount: number;
  rows: EntityRow[];
};

type DeleteQueryDependencies = {
  loadEntityRows: (entityName: string) => Promise<EntityRow[]>;
  saveEntityRows: (entityName: string, rows: EntityRow[]) => Promise<void>;
  queueCommit: (reason: string) => void;
};

export class DeleteQuery implements PromiseLike<DeleteExecutionResult> {
  private whereConditions: WhereInput[] = [];
  private shouldReturn = false;
  private returningFields: string[] | null = null;

  constructor(
    private readonly entity: EntityDefinition,
    private readonly dependencies: DeleteQueryDependencies,
  ) {}

  where(condition: WhereInput): this {
    this.whereConditions.push(condition);
    return this;
  }

  returning(fields?: string[]): this {
    this.shouldReturn = true;
    this.returningFields = fields ?? null;
    return this;
  }

  async execute(): Promise<DeleteExecutionResult> {
    const predicates = toPredicates(this.whereConditions);
    const currentRows = await this.dependencies.loadEntityRows(this.entity.name);

    const deletedRows: EntityRow[] = [];
    const keptRows: EntityRow[] = [];

    for (const row of currentRows) {
      const matches = predicates.length === 0 || predicates.every((predicate) => predicate.test(row));
      if (matches) {
        deletedRows.push(row);
      } else {
        keptRows.push(row);
      }
    }

    if (deletedRows.length > 0) {
      await this.dependencies.saveEntityRows(this.entity.name, keptRows);
      this.dependencies.queueCommit(`delete:${this.entity.name}`);
    }

    const rows = this.shouldReturn ? deletedRows.map((row) => this.pickReturningFields(row)) : [];

    return {
      entity: this.entity.name,
      rowCount: deletedRows.length,
      rows,
    };
  }

  then<TResult1 = DeleteExecutionResult, TResult2 = never>(
    onfulfilled?: ((value: DeleteExecutionResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<DeleteExecutionResult | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<DeleteExecutionResult> {
    return this.execute().finally(onfinally ?? undefined);
  }

  private pickReturningFields(row: EntityRow): EntityRow {
    if (!this.returningFields || !this.returningFields.length) {
      return { ...row };
    }

    const result: EntityRow = {};
    for (const field of this.returningFields) {
      if (Object.prototype.hasOwnProperty.call(row, field)) {
        result[field] = row[field];
      }
    }

    return result;
  }
}
