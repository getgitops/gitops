import crypto from 'node:crypto';
import type { EntityDefinition } from '../core/schema.ts';
import { validateEntityRow } from '../core/schema.ts';

export type EntityRow = Record<string, unknown>;

export type InsertValuesInput = EntityRow | EntityRow[];

export type InsertExecutionResult = {
  entity: string;
  rowCount: number;
  rows: EntityRow[];
};

type InsertQueryDependencies = {
  loadEntityRows: (entityName: string) => Promise<EntityRow[]>;
  saveEntityRows: (entityName: string, rows: EntityRow[]) => Promise<void>;
  queueCommit: (reason: string) => void;
};

export class InsertQuery implements PromiseLike<InsertExecutionResult> {
  private rowsToInsert: EntityRow[] = [];
  private shouldReturn = false;
  private returningFields: string[] | null = null;

  constructor(
    private readonly entity: EntityDefinition,
    private readonly dependencies: InsertQueryDependencies,
  ) {}

  values(values: InsertValuesInput): this {
    const rows = Array.isArray(values) ? values : [values];
    this.rowsToInsert = rows.map((row) => ({ ...row }));
    return this;
  }

  returning(fields?: string[]): this {
    this.shouldReturn = true;
    this.returningFields = fields ?? null;
    return this;
  }

  async execute(): Promise<InsertExecutionResult> {
    if (!this.rowsToInsert.length) {
      throw new Error('insert(...).values(...) requires at least one row');
    }

    const existingRows = await this.dependencies.loadEntityRows(this.entity.name);
    const insertedRows: EntityRow[] = [];

    for (const rawRow of this.rowsToInsert) {
      const prepared = this.prepareInsertRow(rawRow, [...existingRows, ...insertedRows]);
      const validation = validateEntityRow(this.entity, prepared, 'insert');
      if (!validation.valid) {
        throw new Error(`Invalid insert row for ${this.entity.name}: ${validation.errors.join(', ')}`);
      }

      insertedRows.push(prepared);
    }

    const allRows = [...existingRows, ...insertedRows];
    await this.dependencies.saveEntityRows(this.entity.name, allRows);
    this.dependencies.queueCommit(`insert:${this.entity.name}`);

    const rows = this.shouldReturn
      ? insertedRows.map((row) => this.pickReturningFields(row))
      : [];

    return {
      entity: this.entity.name,
      rowCount: insertedRows.length,
      rows,
    };
  }

  then<TResult1 = InsertExecutionResult, TResult2 = never>(
    onfulfilled?: ((value: InsertExecutionResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<InsertExecutionResult | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<InsertExecutionResult> {
    return this.execute().finally(onfinally ?? undefined);
  }

  private prepareInsertRow(rawRow: EntityRow, currentRows: EntityRow[]): EntityRow {
    const row: EntityRow = { ...rawRow };

    for (const [fieldName, fieldDefinition] of Object.entries(this.entity.schema)) {
      if (row[fieldName] !== undefined && row[fieldName] !== null) {
        continue;
      }

      if (fieldDefinition.autoincrement && fieldDefinition.dataType === 'integer') {
        row[fieldName] = this.nextAutoincrementValue(fieldName, currentRows);
        continue;
      }

      if (fieldDefinition.hasDefault && typeof fieldDefinition.defaultFn === 'function') {
        row[fieldName] = fieldDefinition.defaultFn();
        continue;
      }

      if (fieldDefinition.hasDefault) {
        row[fieldName] = fieldDefinition.defaultValue;
        continue;
      }

      if (fieldDefinition.dataType === 'uuid') {
        row[fieldName] = crypto.randomUUID();
      }
    }

    return row;
  }

  private nextAutoincrementValue(fieldName: string, rows: EntityRow[]): number {
    const numericValues = rows
      .map((row) => row[fieldName])
      .filter((value): value is number => typeof value === 'number' && Number.isInteger(value));

    if (!numericValues.length) {
      return 1;
    }

    return Math.max(...numericValues) + 1;
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
