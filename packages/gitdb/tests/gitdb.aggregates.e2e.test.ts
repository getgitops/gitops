import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { GitRepository } from '../src/infrastructure/git-repository.ts';
import { FileManager } from '../src/infrastructure/file-manager.ts';
import { GitDB } from '../src/core/gitdb.ts';
import { and, entity, eq, gte, integer, text } from '../src/index.ts';

type RepositoryStub = Pick<GitRepository, 'queueBackgroundCommit' | 'shutdown'>;

function createRepositoryStub() {
  const stub: RepositoryStub = {
    queueBackgroundCommit() {
      return undefined;
    },
    async shutdown() {
      return undefined;
    },
  };

  return {
    repository: stub as GitRepository,
  };
}

async function createDb() {
  const basePath = await mkdtemp(path.join(tmpdir(), 'gitdb-aggregates-e2e-test-'));
  const fileManager = new FileManager(basePath);
  const { repository } = createRepositoryStub();
  const db = new GitDB(repository, fileManager);

  return {
    db,
    basePath,
  };
}

describe('GitDB aggregate extras e2e', () => {
  it('soporta $count, $sum, $avg, $max y $min con where operators', async () => {
    const { db, basePath } = await createDb();
    const users = entity('users', {
      id: integer().primaryKey().autoincrement(),
      name: text().notNull(),
      age: integer().notNull(),
      score: integer().notNull(),
      status: text().notNull(),
    });

    try {
      await db.insert(users).values([
        { name: 'ana', age: 21, score: 10, status: 'active' },
        { name: 'beto', age: 35, score: 30, status: 'inactive' },
        { name: 'carla', age: 27, score: 50, status: 'active' },
        { name: 'dani', age: 40, score: 70, status: 'active' },
      ]);

      const activeCount = await db.$count(users, eq('status', 'active'));
      expect(activeCount).toBe(3);

      const matureActiveCount = await db.$count(users, and(eq('status', 'active'), gte('age', 25)));
      expect(matureActiveCount).toBe(2);

      const activeScoreSum = await db.$sum(users, 'score', eq('status', 'active'));
      expect(activeScoreSum).toBe(130);

      const activeScoreAvg = await db.$avg(users, 'score', eq('status', 'active'));
      expect(activeScoreAvg).toBeCloseTo(43.333333, 5);

      const maxAge = await db.$max(users, 'age', eq('status', 'active'));
      expect(maxAge).toBe(40);

      const minAge = await db.$min(users, 'age', eq('status', 'active'));
      expect(minAge).toBe(21);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  it('retorna null para avg/max/min cuando no hay filas y 0 para sum/count', async () => {
    const { db, basePath } = await createDb();
    const users = entity('users', {
      id: integer().primaryKey().autoincrement(),
      name: text().notNull(),
      age: integer().notNull(),
      score: integer().notNull(),
    });

    try {
      await db.insert(users).values([
        { name: 'ana', age: 21, score: 10 },
      ]);

      expect(await db.$count(users, eq('name', 'nadie'))).toBe(0);
      expect(await db.$sum(users, 'score', eq('name', 'nadie'))).toBe(0);
      expect(await db.$avg(users, 'score', eq('name', 'nadie'))).toBeNull();
      expect(await db.$max(users, 'score', eq('name', 'nadie'))).toBeNull();
      expect(await db.$min(users, 'score', eq('name', 'nadie'))).toBeNull();
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
});
