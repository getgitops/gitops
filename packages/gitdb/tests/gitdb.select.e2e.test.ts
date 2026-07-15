import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { GitRepository } from '../src/infrastructure/git-repository.ts';
import { FileManager } from '../src/infrastructure/file-manager.ts';
import { GitDB } from '../src/core/gitdb.ts';
import { and, entity, gte, ilike, integer, not, text } from '../src/index.ts';

type RepositoryStub = Pick<GitRepository, 'queueBackgroundCommit' | 'shutdown'>;

function createRepositoryStub() {
  const reasons: string[] = [];

  const stub: RepositoryStub = {
    queueBackgroundCommit(reason: string) {
      reasons.push(reason);
    },
    async shutdown() {
      return undefined;
    },
  };

  return {
    repository: stub as GitRepository,
    reasons,
  };
}

async function createDb() {
  const basePath = await mkdtemp(path.join(tmpdir(), 'gitdb-select-e2e-test-'));
  const fileManager = new FileManager(basePath);
  const { repository } = createRepositoryStub();
  const db = new GitDB(repository, fileManager);

  return {
    db,
    basePath,
  };
}

describe('GitDB select e2e', () => {
  it('consulta rows persistidas con where operadores, orderBy, limit y offset', async () => {
    const { db, basePath } = await createDb();
    const users = entity('users', {
      id: integer().primaryKey().autoincrement(),
      name: text().notNull(),
      status: text().notNull(),
    });

    try {
      await db.insert(users).values([
        { name: 'ana', status: 'active' },
        { name: 'beto', status: 'inactive' },
        { name: 'carla', status: 'active' },
        { name: 'dani', status: 'active' },
      ]);

      const allRows = await db.select().from(users);
      expect(allRows.rows).toHaveLength(4);
      expect(allRows.rows[0]).toEqual({ id: 1, name: 'ana', status: 'active' });

      const selectedFields = await db.select({ id: true }).from(users).orderBy('id', 'asc');
      expect(selectedFields.rows).toEqual([
        { id: 1 },
        { id: 2 },
        { id: 3 },
        { id: 4 },
      ]);

      const filtered = await db
        .select()
        .from(users)
        .where(and(gte('id', 2), ilike('name', '%a%'), not({ status: 'inactive' })))
        .orderBy('name', 'asc');

      expect(filtered.rows.map((row) => row.name)).toEqual(['carla', 'dani']);

      const paginated = await db.select().from(users).orderBy('id', 'asc').offset(1).limit(2);
      expect(paginated.rows.map((row) => row.id)).toEqual([2, 3]);

      const grouped = await db.select().from(users).groupBy('status').having(gte('$count', 2)).orderBy('status', 'asc');
      expect(grouped.rows).toEqual([{ status: 'active', $count: 3 }]);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  it('falla si having se usa sin groupBy', async () => {
    const { db, basePath } = await createDb();
    const users = entity('users', {
      id: integer().primaryKey().autoincrement(),
      name: text().notNull(),
      status: text().notNull(),
    });

    try {
      await db.insert(users).values([{ name: 'ana', status: 'active' }]);

      await expect(db.select().from(users).having(gte('$count', 1)).execute()).rejects.toThrow(
        'having() requires groupBy(...) before execute()',
      );
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
});
