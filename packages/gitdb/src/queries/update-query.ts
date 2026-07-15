import type { EntityDefinition } from '../core/schema.ts';
import { validateEntityRow } from '../core/schema.ts';
import type { EntityRow, WhereInput } from './where-operators.ts';
import { toPredicates } from './where-operators.ts';

export type UpdateSetInput = Record<string, unknown>;

export type UpdateExecutionResult = {
  entity: string;
  rowCount: number;
  rows: EntityRow[];
};

type UpdateQueryDependencies = {
  loadEntityRows: (entityName: string) => Promise<EntityRow[]>;
  saveEntityRows: (entityName: string, rows: EntityRow[]) => Promise<void>;
  queueCommit: (reason: string) => void;
};

export class UpdateQuery implements PromiseLike<UpdateExecutionResult> {
  private setData: UpdateSetInput | null = null;
  private whereConditions: WhereInput[] = [];
  private shouldReturn = false;
  private returningFields: string[] | null = null;

  constructor(
    private readonly entity: EntityDefinition,
    private readonly dependencies: UpdateQueryDependencies,
  ) {}

  set(values: UpdateSetInput): this {
    this.setData = { ...values };
    return this;
  }

  where(condition: WhereInput): this {
    this.whereConditions.push(condition);
    return this;
  }

  returning(fields?: string[]): this {
    this.shouldReturn = true;
    this.returningFields = fields ?? null;
    return this;
  }

  async execute(): Promise<UpdateExecutionResult> {
    if (!this.setData || Object.keys(this.setData).length === 0) {
      throw new Error('update(...).set(...) requires at least one field');
    }

    const predicates = toPredicates(this.whereConditions);
    const currentRows = await this.dependencies.loadEntityRows(this.entity.name);

    const updatedRows: EntityRow[] = [];
    const nextRows = currentRows.map((row) => {
      const matches = predicates.length === 0 || predicates.every((predicate) => predicate.test(row));
      if (!matches) {
        return row;
      }

      const updated = { ...row, ...this.setData };
      const validation = validateEntityRow(this.entity, updated, 'insert');
      if (!validation.valid) {
        throw new Error(`Invalid update row for ${this.entity.name}: ${validation.errors.join(', ')}`);
      }

      updatedRows.push(updated);
      return updated;
    });

    if (updatedRows.length > 0) {
      await this.dependencies.saveEntityRows(this.entity.name, nextRows);
      this.dependencies.queueCommit(`update:${this.entity.name}`);
    }

    const rows = this.shouldReturn ? updatedRows.map((row) => this.pickReturningFields(row)) : [];

    return {
      entity: this.entity.name,
      rowCount: updatedRows.length,
      rows,
    };
  }

  then<TResult1 = UpdateExecutionResult, TResult2 = never>(
    onfulfilled?: ((value: UpdateExecutionResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<UpdateExecutionResult | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<UpdateExecutionResult> {
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
