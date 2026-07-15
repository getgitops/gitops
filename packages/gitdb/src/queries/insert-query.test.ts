import { describe, expect, it } from 'vitest';
import { entity, integer, text, uuid } from '../core/schema.ts';
import { InsertQuery } from './insert-query.ts';

type Row = Record<string, unknown>;

function createInsertQuery(initialRows: Row[] = []) {
  let persistedRows = [...initialRows];
  const commitReasons: string[] = [];

  const users = entity('users', {
    id: integer().primaryKey().autoincrement(),
    name: text().notNull(),
  });

  const query = new InsertQuery(users, {
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
    users,
    getPersistedRows: () => [...persistedRows],
    getCommitReasons: () => [...commitReasons],
  };
}

describe('InsertQuery', () => {
  it('inserta una fila con values({})', async () => {
    const { query, getPersistedRows, getCommitReasons } = createInsertQuery();

    const result = await query.values({ name: 'kettu' });

    expect(result.entity).toBe('users');
    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([]);

    const persisted = getPersistedRows();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.id).toBe(1);
    expect(persisted[0]?.name).toBe('kettu');

    expect(getCommitReasons()).toEqual(['insert:users']);
  });

  it('inserta varias filas con values([]) y autoincrementa', async () => {
    const { query, getPersistedRows } = createInsertQuery([{ id: 5, name: 'seed' }]);

    const result = await query.values([{ name: 'ana' }, { name: 'beto' }]).returning(['id', 'name']);

    expect(result.rowCount).toBe(2);
    expect(result.rows).toEqual([
      { id: 6, name: 'ana' },
      { id: 7, name: 'beto' },
    ]);

    const persisted = getPersistedRows();
    expect(persisted).toHaveLength(3);
    expect(persisted[1]?.id).toBe(6);
    expect(persisted[2]?.id).toBe(7);
  });

  it('valida schema y falla cuando falta campo notNull', async () => {
    const { query } = createInsertQuery();
    await expect(query.values({})).rejects.toThrow('Field name is required');
  });

  it('returning() sin campos devuelve fila completa', async () => {
    const { query } = createInsertQuery();

    const result = await query.values({ name: 'kettu' }).returning();

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ id: 1, name: 'kettu' });
  });

  it('autogenera uuid cuando el schema usa uuid y no viene en values', async () => {
    let persistedRows: Row[] = [];
    const users = entity('users', {
      id: uuid().primaryKey(),
      name: text().notNull(),
    });

    const query = new InsertQuery(users, {
      loadEntityRows: async () => [...persistedRows],
      saveEntityRows: async (_entityName, rows) => {
        persistedRows = [...rows];
      },
      queueCommit: () => undefined,
    });

    const result = await query.values({ name: 'kettu' }).returning(['id', 'name']);

    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.name).toBe('kettu');
    expect(typeof result.rows[0]?.id).toBe('string');
    expect(String(result.rows[0]?.id)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(persistedRows[0]?.id).toBe(result.rows[0]?.id);
  });

  it('requiere values antes de ejecutar', async () => {
    const { query } = createInsertQuery();
    await expect(query.execute()).rejects.toThrow('insert(...).values(...) requires at least one row');
  });

  it('permite await directo sin execute', async () => {
    const { query } = createInsertQuery();

    const result = await query.values({ name: 'awaitable' }).returning(['id']);
    expect(result.rows).toEqual([{ id: 1 }]);
  });
});
