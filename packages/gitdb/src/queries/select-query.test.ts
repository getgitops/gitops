import { describe, expect, it } from 'vitest';
import { defineRelations } from '../core/relations.ts';
import { entity } from '../core/schema.ts';
import { SelectQuery, and, eq, gte, ilike, lt, ne, not, or } from './select-query.ts';
import type { IncludeRelationsInput } from './select-query.ts';

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

const roles = entity('roles', {
  id: 'int',
  label: 'string',
});

const posts = entity('posts', {
  id: 'int',
  userId: 'int',
  title: 'string',
});

const comments = entity('comments', {
  id: 'int',
  postId: 'int',
  content: 'string',
});

const usersWithRole = entity('users', {
  id: 'int',
  roleId: 'int',
  name: 'string',
});

function createQueryWithRelations(includeRelations?: IncludeRelationsInput) {
  const relations = defineRelations();
  relations.for(usersWithRole, ({ one, many }) => ({
    role: one(roles, { fields: ['roleId'], references: ['id'] }),
    posts: many(posts, { fields: ['id'], references: ['userId'] }),
  }));
  relations.for(posts, ({ many }) => ({
    comments: many(comments, { fields: ['id'], references: ['postId'] }),
  }));

  return new SelectQuery(async (entityName) => {
    if (entityName === 'users') {
      return [
        { id: 1, roleId: 1, name: 'Ana' },
        { id: 2, roleId: 2, name: 'Beto' },
      ];
    }

    if (entityName === 'roles') {
      return [
        { id: 1, label: 'admin' },
        { id: 2, label: 'developer' },
      ];
    }

    if (entityName === 'posts') {
      return [
        { id: 10, userId: 1, title: 'a' },
        { id: 11, userId: 1, title: 'b' },
        { id: 12, userId: 2, title: 'c' },
      ];
    }

    if (entityName === 'comments') {
      return [
        { id: 100, postId: 10, content: 'c1' },
        { id: 101, postId: 10, content: 'c2' },
        { id: 102, postId: 11, content: 'c3' },
      ];
    }

    return [];
  }, {
    relationsRegistry: relations,
    includeRelations: includeRelations ?? null,
  });
}

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

  it('proyecta solo campos seleccionados cuando se usa selectFields', async () => {
    const query = new SelectQuery(
      async (entityName) => {
        if (entityName !== 'users') {
          return [];
        }

        return [...rows];
      },
      { selectFields: { id: true, name: true } },
    );

    const result = await query.from(users);

    expect(result.rows).toEqual([
      { id: 1, name: 'Ana' },
      { id: 2, name: 'Beto' },
      { id: 3, name: 'Carla' },
      { id: 4, name: 'Daniel' },
    ]);
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
    const query = createQuery()
      .from(users)
      .where({ id: 1 })
      .groupBy('active')
      .having(gte('$count', 1))
      .orderBy('id', 'desc')
      .limit(1)
      .offset(1);
    query.reset().from(users);

    const result = await query;
    expect(result.rows).toHaveLength(4);
  });

  it('agrupa filas con groupBy y expone $count', async () => {
    const result = await createQuery().from(users).groupBy('active').orderBy('active', 'asc');

    expect(result.rows).toEqual([
      { active: false, $count: 1 },
      { active: true, $count: 3 },
    ]);
  });

  it('filtra grupos con having', async () => {
    const result = await createQuery().from(users).groupBy('active').having(gte('$count', 2));

    expect(result.rows).toEqual([{ active: true, $count: 3 }]);
  });

  it('lanza error si se usa having sin groupBy', async () => {
    await expect(createQuery().from(users).having(gte('$count', 1)).execute()).rejects.toThrow(
      'having() requires groupBy(...) before execute()',
    );
  });

  it('hidrata relaciones con contexto de with', async () => {
    const result = await createQueryWithRelations().from(usersWithRole).where({ id: 1 });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as Record<string, unknown>;
    expect((row.role as Record<string, unknown>)?.label).toBe('admin');
    expect((row.posts as Array<Record<string, unknown>>).map((post) => post.id).sort()).toEqual([10, 11]);
  });

  it('permite include selectivo con mapa booleano', async () => {
    const result = await createQueryWithRelations({ role: true, posts: false }).from(usersWithRole).where({ id: 1 });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as Record<string, unknown>;
    expect((row.role as Record<string, unknown>)?.label).toBe('admin');
    expect('posts' in row).toBe(false);
  });

  it('soporta include anidado con mapa de relaciones', async () => {
    const result = await createQueryWithRelations({ posts: { comments: true } }).from(usersWithRole).where({ id: 1 });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as Record<string, unknown>;
    expect('role' in row).toBe(false);

    const rowPosts = row.posts as Array<Record<string, unknown>>;
    expect(rowPosts).toHaveLength(2);

    const post10 = rowPosts.find((post) => post.id === 10);
    expect(post10).toBeDefined();
    expect((post10?.comments as Array<Record<string, unknown>>).map((comment) => comment.id).sort()).toEqual([100, 101]);

    const post11 = rowPosts.find((post) => post.id === 11);
    expect(post11).toBeDefined();
    expect((post11?.comments as Array<Record<string, unknown>>).map((comment) => comment.id)).toEqual([102]);
  });
});
