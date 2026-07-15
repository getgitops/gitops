import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { GitRepository } from '../src/infrastructure/git-repository.ts';
import { FileManager } from '../src/infrastructure/file-manager.ts';
import { GitDB } from '../src/core/gitdb.ts';
import { and, entity, eq, gte, integer, not, text } from '../src/index.ts';

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
  const basePath = await mkdtemp(path.join(tmpdir(), 'gitdb-delete-e2e-test-'));
  const fileManager = new FileManager(basePath);
  const { repository, reasons } = createRepositoryStub();
  const db = new GitDB(repository, fileManager);

  return {
    db,
    reasons,
    basePath,
  };
}

describe('GitDB delete e2e', () => {
  it('borra con where y devuelve returning, manteniendo filas no coincidentes', async () => {
    const { db, reasons, basePath } = await createDb();
    const users = entity('users', {
      id: integer().primaryKey().autoincrement(),
      name: text().notNull(),
      status: text().notNull(),
    });

    try {
      await db.insert(users).values([
        { name: 'ana', status: 'draft' },
        { name: 'beto', status: 'draft' },
        { name: 'carla', status: 'archived' },
      ]);

      const deleted = await db
        .delete(users)
        .where(and(gte('id', 2), not(eq('status', 'archived'))))
        .returning(['id', 'name']);

      expect(deleted.rowCount).toBe(1);
      expect(deleted.rows).toEqual([{ id: 2, name: 'beto' }]);
      expect(reasons).toContain('delete:users');

      const remaining = await db.select().from(users);
      expect(remaining.rows.map((row) => row.id)).toEqual([1, 3]);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
});
