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
  const basePath = await mkdtemp(path.join(tmpdir(), 'gitdb-update-e2e-test-'));
  const fileManager = new FileManager(basePath);
  const { repository, reasons } = createRepositoryStub();
  const db = new GitDB(repository, fileManager);

  return {
    db,
    fileManager,
    reasons,
    basePath,
  };
}

describe('GitDB update e2e', () => {
  it('actualiza filas con operadores where reutilizados y permite consultar resultado', async () => {
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

      const updateResult = await db
        .update(users)
        .set({ status: 'review' })
        .where(and(gte('id', 2), not(eq('status', 'archived'))))
        .returning(['id', 'status']);

      expect(updateResult.rowCount).toBe(1);
      expect(updateResult.rows).toEqual([{ id: 2, status: 'review' }]);
      expect(reasons).toContain('update:users');

      const selected = await db.select().from(users).where({ id: 2 });
      expect(selected.rows[0]?.status).toBe('review');
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
});
