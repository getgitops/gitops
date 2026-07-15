import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGitDB } from './index';

type User = {
  id?: string;
  username: string;
  role: string;
};

describe('@kettu/gitdb', () => {
  it('inserta y consulta registros en archivos json versionados con git', async () => {
    const dbPath = path.resolve(process.cwd(), `.tmp-gitdb-test-${randomUUID()}`);
    const db = await createGitDB({ repositoryPath: dbPath, immediateCommitDelayMs: 50 });

    try {
      const users = db.model<User>('users');
      const inserted = await users.insert({ username: 'fox', role: 'admin' });
      await users.insertMany([
        { username: 'ana', role: 'developer' },
        { username: 'luis', role: 'developer' },
      ]);

      const admin = await users.findBy({ role: 'admin' });
      const developers = await users.where({ role: 'developer' }).all();
      const byId = await users.findById(inserted.id as string);

      expect(admin?.username).toBe('fox');
      expect(developers).toHaveLength(2);
      expect(byId?.id).toBe(inserted.id);

      await db.commitNow('test');
    } finally {
      await db.close();
      await rm(dbPath, { recursive: true, force: true });
    }
  });
});
