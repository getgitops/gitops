import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { GitRepository } from '../src/infrastructure/git-repository.ts';
import { FileManager } from '../src/infrastructure/file-manager.ts';
import { GitDB } from '../src/core/gitdb.ts';
import { defineRelations, entity, integer, text } from '../src/index.ts';

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
  const basePath = await mkdtemp(path.join(tmpdir(), 'gitdb-with-e2e-test-'));
  const fileManager = new FileManager(basePath);
  const { repository } = createRepositoryStub();
  const db = new GitDB(repository, fileManager);

  return {
    db,
    basePath,
  };
}

async function seedWithRelations(db: GitDB) {
  const roles = entity('roles', {
    id: integer().primaryKey(),
    name: text().notNull(),
  });

  const users = entity('users', {
    id: integer().primaryKey().autoincrement(),
    roleId: integer().notNull(),
    name: text().notNull(),
  });

  const posts = entity('posts', {
    id: integer().primaryKey().autoincrement(),
    userId: integer().notNull(),
    title: text().notNull(),
  });

  const comments = entity('comments', {
    id: integer().primaryKey().autoincrement(),
    postId: integer().notNull(),
    content: text().notNull(),
  });

  const relations = defineRelations();
  relations.for(users, ({ one, many }) => ({
    roles: one(roles, { fields: ['roleId'], references: ['id'] }),
    posts: many(posts, { fields: ['id'], references: ['userId'] }),
  }));

  relations.for(posts, ({ many }) => ({
    comments: many(comments, { fields: ['id'], references: ['postId'] }),
  }));

  await db.insert(roles).values([
    { id: 1, name: 'admin' },
    { id: 2, name: 'developer' },
  ]);

  await db.insert(users).values([
    { name: 'ana', roleId: 1 },
    { name: 'beto', roleId: 2 },
  ]);

  await db.insert(posts).values([
    { userId: 1, title: 'post-a' },
    { userId: 1, title: 'post-b' },
    { userId: 2, title: 'post-c' },
  ]);

  await db.insert(comments).values([
    { postId: 1, content: 'comment-a1' },
    { postId: 1, content: 'comment-a2' },
    { postId: 2, content: 'comment-b1' },
  ]);

  return {
    users,
    relations,
  };
}

describe('GitDB with e2e', () => {
  it('permite include completo con with({ roles: true, posts: true })', async () => {
    const { db, basePath } = await createDb();

    try {
      const { users } = await seedWithRelations(db);
      const result = await db.with({ roles: true, posts: true }).select().from(users).where({ id: 1 });

      expect(result.rows).toHaveLength(1);
      const row = result.rows[0] as Record<string, unknown>;
      expect((row.roles as Record<string, unknown>)?.name).toBe('admin');
      expect(Array.isArray(row.posts)).toBe(true);
      expect((row.posts as Array<Record<string, unknown>>).map((post) => post.title).sort()).toEqual(['post-a', 'post-b']);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  it('permite include parcial con with({ roles: true }) y no trae posts', async () => {
    const { db, basePath } = await createDb();

    try {
      const { users } = await seedWithRelations(db);
      const result = await db.with({ roles: true }).select().from(users).where({ id: 1 });

      expect(result.rows).toHaveLength(1);
      const row = result.rows[0] as Record<string, unknown>;
      expect((row.roles as Record<string, unknown>)?.name).toBe('admin');
      expect('posts' in row).toBe(false);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  it('soporta with anidado con with({ posts: { comments: true } })', async () => {
    const { db, basePath } = await createDb();

    try {
      const { users } = await seedWithRelations(db);
      const result = await db.with({ posts: { comments: true } }).select().from(users).where({ id: 1 });

      expect(result.rows).toHaveLength(1);
      const row = result.rows[0] as Record<string, unknown>;
      expect('roles' in row).toBe(false);

      const userPosts = row.posts as Array<Record<string, unknown>>;
      expect(userPosts).toHaveLength(2);

      const postA = userPosts.find((post) => post.title === 'post-a');
      expect(postA).toBeDefined();
      expect((postA?.comments as Array<Record<string, unknown>>).map((comment) => comment.content).sort()).toEqual([
        'comment-a1',
        'comment-a2',
      ]);

      const postB = userPosts.find((post) => post.title === 'post-b');
      expect(postB).toBeDefined();
      expect((postB?.comments as Array<Record<string, unknown>>).map((comment) => comment.content)).toEqual([
        'comment-b1',
      ]);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
});
