import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { GitRepository } from '../src/infrastructure/git-repository.ts';
import { FileManager } from '../src/infrastructure/file-manager.ts';
import { GitDB } from '../src/core/gitdb.ts';
import { entity, integer, text, uuid } from '../src/core/schema.ts';

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
  const basePath = await mkdtemp(path.join(tmpdir(), 'gitdb-e2e-test-'));
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

describe('GitDB insert e2e', () => {
  it('inserta multiples filas y luego select/from/where devuelve datos persistidos', async () => {
    const { db, reasons, basePath } = await createDb();
    const users = entity('users', {
      id: integer().primaryKey().autoincrement(),
      name: text().notNull(),
    });

    try {
      const insertResult = await db.insert(users).values([{ name: 'ana' }, { name: 'beto' }]).returning(['id', 'name']);

      expect(insertResult.rowCount).toBe(2);
      expect(insertResult.rows).toEqual([
        { id: 1, name: 'ana' },
        { id: 2, name: 'beto' },
      ]);
      expect(reasons).toContain('insert:users');

      const selectResult = await db.select().from(users).where({ id: 2 });
      expect(selectResult.rows).toHaveLength(1);
      expect(selectResult.rows[0]?.name).toBe('beto');
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  it('returning devuelve uuid autogenerado en insercion via db.insert', async () => {
    const { db, fileManager, basePath } = await createDb();
    const users = entity('users', {
      id: uuid().primaryKey(),
      name: text().notNull(),
    });

    try {
      const result = await db.insert(users).values({ name: 'kettu' }).returning(['id', 'name']);

      expect(result.rowCount).toBe(1);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.name).toBe('kettu');
      expect(typeof result.rows[0]?.id).toBe('string');
      expect(String(result.rows[0]?.id)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const persisted = await fileManager.readEntityRows<Record<string, unknown>>('users');
      expect(persisted[0]?.id).toBe(result.rows[0]?.id);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
});
