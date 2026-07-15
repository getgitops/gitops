import { describe, expect, it } from 'vitest';
import { entity } from '../core/schema.ts';
import { SelectQuery, and, eq, gte, ilike, lt, ne, not, or } from './select-query.ts';

type UserRow = {
  id: number;
  name: string;
  age: number;
  active: boolean;
};

const users = entity('users', {
  id: 'int',
  name: 'string',
  age: 'int',
  active: 'boolean',
});

const rows: UserRow[] = [
  { id: 1, name: 'Ana', age: 22, active: true },
  { id: 2, name: 'Beto', age: 30, active: false },
  { id: 3, name: 'Carla', age: 30, active: true },
  { id: 4, name: 'Daniel', age: 18, active: true },
];

function createQuery() {
  return new SelectQuery(async (entityName) => {
    if (entityName !== 'users') {
      return [];
    }

    return [...rows];
  });
}

describe('SelectQuery', () => {
  it('devuelve todas las filas cuando no hay where', async () => {
    const result = await createQuery().from(users);
    expect(result.entity).toBe('users');
    expect(result.rows).toHaveLength(4);
  });

  it('filtra por where con objeto simple', async () => {
    const result = await createQuery().from(users).where({ id: 1 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe('Ana');
  });

  it('soporta operadores eq, ne, lt y gte', async () => {
    const result = await createQuery()
      .from(users)
      .where(and(eq('age', 30), ne('name', 'Beto'), gte('id', 2), lt('id', 4)));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe('Carla');
  });

  it('soporta operadores or y not', async () => {
    const result = await createQuery()
      .from(users)
      .where(or(eq('id', 1), eq('id', 2)))
      .where(not(eq('active', false)));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe(1);
  });

  it('soporta ilike con patrones % y _', async () => {
    const startsWithA = await createQuery().from(users).where(ilike('name', 'a%'));
    expect(startsWithA.rows.map((row) => row.name)).toEqual(['Ana']);

    const secondLetterA = await createQuery().from(users).where(ilike('name', '_a%'));
    expect(secondLetterA.rows.map((row) => row.name).sort()).toEqual(['Carla', 'Daniel']);
  });

  it('aplica orderBy, offset y limit', async () => {
    const result = await createQuery().from(users).orderBy('age', 'asc').offset(1).limit(2);
    expect(result.rows.map((row) => row.id)).toEqual([1, 2]);
  });

  it('lanza error si falta from', async () => {
    await expect(createQuery().execute()).rejects.toThrow('select().from(...) is required before execute()');
  });

  it('permite await directo sin llamar execute', async () => {
    const result = await createQuery().from(users).where({ active: true });
    expect(result.rows.map((row) => row.id)).toEqual([1, 3, 4]);
  });

  it('reset limpia el estado de la query', async () => {
    const query = createQuery().from(users).where({ id: 1 }).orderBy('id', 'desc').limit(1).offset(1);
    query.reset().from(users);

    const result = await query;
    expect(result.rows).toHaveLength(4);
  });
});
