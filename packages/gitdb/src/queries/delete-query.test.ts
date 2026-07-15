import { describe, expect, it } from 'vitest';
import { entity, integer, text } from '../core/schema.ts';
import { and, eq, gte, not } from './where-operators.ts';
import { DeleteQuery } from './delete-query.ts';

type Row = Record<string, unknown>;

function createDeleteQuery(initialRows: Row[] = []) {
  let persistedRows = [...initialRows];
  const commitReasons: string[] = [];

  const users = entity('users', {
    id: integer().primaryKey().autoincrement(),
    name: text().notNull(),
    status: text().notNull(),
  });

  const query = new DeleteQuery(users, {
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

describe('DeleteQuery', () => {
  it('elimina por where con objeto', async () => {
    const { query, getPersistedRows, getCommitReasons } = createDeleteQuery([
      { id: 1, name: 'ana', status: 'draft' },
      { id: 2, name: 'beto', status: 'draft' },
    ]);

    const result = await query.where({ id: 2 }).returning(['id', 'name']);

    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([{ id: 2, name: 'beto' }]);
    expect(getPersistedRows()).toEqual([{ id: 1, name: 'ana', status: 'draft' }]);
    expect(getCommitReasons()).toEqual(['delete:users']);
  });

  it('reutiliza operadores where compartidos', async () => {
    const { query, getPersistedRows } = createDeleteQuery([
      { id: 1, name: 'ana', status: 'draft' },
      { id: 2, name: 'beto', status: 'draft' },
      { id: 3, name: 'carla', status: 'archived' },
    ]);

    const result = await query
      .where(and(gte('id', 2), not(eq('status', 'archived'))))
      .returning(['id']);

    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([{ id: 2 }]);
    expect(getPersistedRows().map((row) => row.id)).toEqual([1, 3]);
  });

  it('sin where elimina todo', async () => {
    const { query, getPersistedRows } = createDeleteQuery([
      { id: 1, name: 'ana', status: 'draft' },
      { id: 2, name: 'beto', status: 'draft' },
    ]);

    const result = await query.returning(['id']);
    expect(result.rowCount).toBe(2);
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(getPersistedRows()).toEqual([]);
  });

  it('si no hay coincidencias no persiste ni encola commit', async () => {
    const { query, getPersistedRows, getCommitReasons } = createDeleteQuery([
      { id: 1, name: 'ana', status: 'draft' },
    ]);

    const result = await query.where({ id: 999 });
    expect(result.rowCount).toBe(0);
    expect(result.rows).toEqual([]);
    expect(getPersistedRows()).toEqual([{ id: 1, name: 'ana', status: 'draft' }]);
    expect(getCommitReasons()).toEqual([]);
  });

  it('permite await directo sin execute', async () => {
    const { query } = createDeleteQuery([
      { id: 1, name: 'ana', status: 'draft' },
    ]);

    const result = await query.where({ id: 1 }).returning(['id']);
    expect(result.rows).toEqual([{ id: 1 }]);
  });
});
