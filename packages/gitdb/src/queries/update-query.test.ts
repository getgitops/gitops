import { describe, expect, it } from 'vitest';
import { entity, integer, text } from '../core/schema.ts';
import { and, eq, gte, not } from './where-operators.ts';
import { UpdateQuery } from './update-query.ts';

type Row = Record<string, unknown>;

function createUpdateQuery(initialRows: Row[] = []) {
  let persistedRows = [...initialRows];
  const commitReasons: string[] = [];

  const users = entity('users', {
    id: integer().primaryKey().autoincrement(),
    name: text().notNull(),
    status: text().notNull(),
  });

  const query = new UpdateQuery(users, {
    loadEntityRows: async () => [...persistedRows],
    saveEntityRows: async (_entityName, rows) => {
      persistedRows = [...rows];
    },
    queueCommit: (reason) => {
      commitReasons.push(reason);
    },
  });

  return {
    query,
    getPersistedRows: () => [...persistedRows],
    getCommitReasons: () => [...commitReasons],
  };
}

describe('UpdateQuery', () => {
  it('actualiza fila usando where con objeto', async () => {
    const { query, getPersistedRows, getCommitReasons } = createUpdateQuery([
      { id: 1, name: 'ana', status: 'draft' },
      { id: 2, name: 'beto', status: 'draft' },
    ]);

    const result = await query.set({ status: 'published' }).where({ id: 2 }).returning(['id', 'status']);

    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([{ id: 2, status: 'published' }]);

    const persisted = getPersistedRows();
    expect(persisted[0]?.status).toBe('draft');
    expect(persisted[1]?.status).toBe('published');
    expect(getCommitReasons()).toEqual(['update:users']);
  });

  it('reutiliza operadores where (and/eq/gte/not)', async () => {
    const { query } = createUpdateQuery([
      { id: 1, name: 'ana', status: 'draft' },
      { id: 2, name: 'beto', status: 'draft' },
      { id: 3, name: 'carla', status: 'archived' },
    ]);

    const result = await query
      .set({ status: 'review' })
      .where(and(gte('id', 2), not(eq('status', 'archived'))))
      .returning(['id', 'status']);

    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([{ id: 2, status: 'review' }]);
  });

  it('si no hay where actualiza todas las filas', async () => {
    const { query, getPersistedRows } = createUpdateQuery([
      { id: 1, name: 'ana', status: 'draft' },
      { id: 2, name: 'beto', status: 'draft' },
    ]);

    const result = await query.set({ status: 'done' }).returning(['status']);
    expect(result.rowCount).toBe(2);
    expect(result.rows).toEqual([{ status: 'done' }, { status: 'done' }]);

    const persisted = getPersistedRows();
    expect(persisted[0]?.status).toBe('done');
    expect(persisted[1]?.status).toBe('done');
  });

  it('valida schema en update y falla con tipo incompatible', async () => {
    const { query } = createUpdateQuery([{ id: 1, name: 'ana', status: 'draft' }]);
    await expect(query.set({ id: 'bad-id' }).where({ id: 1 })).rejects.toThrow('Field id expects integer');
  });

  it('requiere set(...) con al menos un campo', async () => {
    const { query } = createUpdateQuery([{ id: 1, name: 'ana', status: 'draft' }]);
    await expect(query.execute()).rejects.toThrow('update(...).set(...) requires at least one field');
  });

  it('permita await directo sin execute', async () => {
    const { query } = createUpdateQuery([{ id: 1, name: 'ana', status: 'draft' }]);
    const result = await query.set({ status: 'done' }).where({ id: 1 }).returning(['id']);
    expect(result.rows).toEqual([{ id: 1 }]);
  });
});
