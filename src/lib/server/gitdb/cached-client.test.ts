import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  defineRelations,
  entity,
  gitDb,
  gte,
  ilike,
  integer,
  json,
  text,
  type GitDB,
} from '@getgitops/gitdb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserEntity } from '#lib/database/schemas';
import { CachedGitDb } from './cached-client';
import { MemoryEntityCache } from './cache';

const logs = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock('../logger', () => ({ createLogger: () => logs }));

const exec = promisify(execFile);
const Items = entity('items', {
  id: text().primaryKey(),
  category: text(),
  value: integer(),
  payload: json(),
});
const Parents = entity('parents', { id: text().primaryKey(), ownerId: text() });
const Owners = entity('owners', { id: text().primaryKey(), name: text() });
const Children = entity('children', { id: text().primaryKey(), parentId: text() });
const registry = defineRelations();
registry.for(Items, ({ one }) => ({
  parent: one(Parents, { fields: ['id'], references: ['id'] }),
}));
registry.for(Parents, ({ one, many }) => ({
  owner: one(Owners, { fields: ['ownerId'], references: ['id'] }),
  children: many(Children, { fields: ['id'], references: ['parentId'] }),
}));

const initialRows = [
  { id: '1', category: 'a', value: 4, payload: { nested: ['original'] } },
  { id: '2', category: 'b', value: 2 },
  { id: '3', category: 'a', value: 8 },
  { id: '4', category: null, value: null },
];
const categoryFilter = ilike('category', '%a%');
const groupFilter = gte('$count', 2);

describe('GitOps entity cache with real GitDB persistence', () => {
  let root: string;
  let dataPath: string;
  let raw: GitDB;
  let cache: MemoryEntityCache;
  let db: CachedGitDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    root = await mkdtemp(path.join(tmpdir(), 'gitops-cache-'));
    const remote = path.join(root, 'remote');
    dataPath = path.join(root, 'data');
    await mkdir(remote);
    await exec('git', ['init', '-b', 'main', remote]);
    await exec('git', ['-C', remote, 'config', 'user.name', 'Cache test']);
    await exec('git', ['-C', remote, 'config', 'user.email', 'cache@test.local']);
    const tables = {
      items: initialRows,
      parents: [{ id: '1', ownerId: 'owner' }],
      owners: [{ id: 'owner', name: 'Owner' }],
      children: [{ id: 'child', parentId: '1' }],
      extra: [{ id: 'unregistered' }],
      users: [{ id: 'user', username: 'User', roleId: 'role' }],
      roles: [{ id: 'role', name: 'Role' }],
    };
    for (const [name, rows] of Object.entries(tables)) {
      await writeFile(path.join(remote, `${name}.json`), JSON.stringify(rows));
    }
    const directory = `chunked.chunks-${randomUUID()}`;
    await mkdir(path.join(remote, directory));
    const bytes = Buffer.from(JSON.stringify([{ id: 'chunk', value: '\u20ac'.repeat(20) }]));
    const split = bytes.indexOf(Buffer.from('\u20ac')) + 1;
    await writeFile(path.join(remote, directory, '000000.part'), bytes.subarray(0, split));
    await writeFile(path.join(remote, directory, '000001.part'), bytes.subarray(split));
    await writeFile(
      path.join(remote, 'chunked.json'),
      JSON.stringify({
        kind: 'gitdb-chunks',
        version: 1,
        directory,
        chunks: ['000000.part', '000001.part'],
      }),
    );
    await exec('git', ['-C', remote, 'add', '-A']);
    await exec('git', ['-C', remote, 'commit', '-m', 'Seed cache fixtures']);
    const origin = path.join(root, 'origin.git');
    await exec('git', ['clone', '--bare', remote, origin]);
    raw = gitDb(origin, {
      dataPath,
      syncPollSeconds: 0,
      autoCommitIntervalMs: 60_000,
      immediateCommitDelayMs: 60_000,
      logger: { info() {}, error() {} },
    });
    cache = new MemoryEntityCache();
    db = new CachedGitDb(raw, dataPath, cache);
    await db.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await db.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preloads all current tables, including unregistered and chunked entities, before ready', async () => {
    const get = vi.spyOn(cache, 'get');
    const set = vi.spyOn(cache, 'set');
    expect((await db.select().from(entity('extra', {}))).rows).toEqual([{ id: 'unregistered' }]);
    expect((await db.select().from(entity('chunked', {}))).rows).toEqual([
      { id: 'chunk', value: '\u20ac'.repeat(20) },
    ]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(set).not.toHaveBeenCalled();
    expect(logs.info).toHaveBeenCalledWith(
      expect.objectContaining({ entities: 8 }),
      'entity cache warmed',
    );
  });

  it('performs zero filesystem access on cache hits, even when the entire clone is unavailable', async () => {
    const parked = path.join(root, 'parked');
    await rename(dataPath, parked);
    try {
      expect((await db.select().from(Items).where({ id: '1' }).limit(1)).rows).toEqual([
        initialRows[0],
      ]);
      expect((await db.select().from(entity('chunked', {}))).rows[0].value).toBe(
        '\u20ac'.repeat(20),
      );
      expect(
        (
          await db
            .with(registry, { parent: { owner: true, children: true } })
            .select()
            .from(Items)
            .where({ id: '1' })
        ).rows[0],
      ).toMatchObject({
        parent: { owner: { name: 'Owner' }, children: [{ id: 'child' }] },
      });
      expect(await db.$sum(Items, 'value')).toBe(14);
      await expect(raw.select().from(Items).execute()).rejects.toThrow();
    } finally {
      await rename(parked, dataPath);
    }
  });

  it('falls back to GitDB on a miss and repopulates the backend', async () => {
    const key = JSON.stringify([dataPath, 'items']);
    await cache.delete(key);
    const set = vi.spyOn(cache, 'set');
    expect((await db.select().from(Items)).rows).toEqual(initialRows);
    expect(set).toHaveBeenCalledWith(key, initialRows);
    set.mockClear();
    await db.select().from(Items);
    expect(set).not.toHaveBeenCalled();
  });

  it('rebuilds startup entries instead of trusting stale contents of an external backend', async () => {
    await cache.set(JSON.stringify([dataPath, 'items']), [{ id: 'stale' }]);
    await cache.set(JSON.stringify([dataPath, 'deleted']), [{ id: 'removed' }]);
    const restarted = new CachedGitDb(raw, dataPath, cache);
    await restarted.ready();
    expect((await restarted.select().from(Items)).rows).toEqual(initialRows);
    expect((await restarted.select().from(entity('deleted', {}))).rows).toEqual([]);
  });

  it('gates readiness and early queries until the cache preload completes', async () => {
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    const set = cache.set.bind(cache);
    vi.spyOn(cache, 'set').mockImplementationOnce(async (key, rows) => {
      entered.resolve();
      await gate.promise;
      await set(key, rows);
    });
    const warming = new CachedGitDb(raw, dataPath, cache);
    const ready = vi.fn();
    const selected = vi.fn();
    const startup = warming.ready().then(ready);
    const query = warming.select().from(Items).then(selected);
    await entered.promise;
    try {
      expect(ready).not.toHaveBeenCalled();
      expect(selected).not.toHaveBeenCalled();
    } finally {
      gate.resolve();
    }
    await Promise.all([startup, query]);
    expect(ready).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ rows: initialRows }));
  });

  it('propagates preload errors through readiness and early queries', async () => {
    const invalid = path.join(dataPath, 'invalid.json');
    await writeFile(invalid, 'invalid JSON');
    try {
      const failed = new CachedGitDb(raw, dataPath, cache);
      await expect(failed.ready()).rejects.toThrow();
      await expect(failed.select().from(Items).execute()).rejects.toThrow();
    } finally {
      await rm(invalid);
    }
  });

  it('clones only projected result rows, and does not clone tables for aggregates', async () => {
    const clone = vi.spyOn(globalThis, 'structuredClone');
    expect((await db.select({ id: true }).from(Items).where({ id: '1' }).limit(1)).rows).toEqual([
      { id: '1' },
    ]);
    expect(clone).toHaveBeenCalledExactlyOnceWith([{ id: '1' }]);
    expect(await db.$count(Items)).toBe(4);
    expect(await db.$sum(Items, 'value')).toBe(14);
    expect(clone).toHaveBeenCalledOnce();
  });

  it('projects cached snapshots before cloning and refreshes projections after writes', async () => {
    const clone = vi.spyOn(globalThis, 'structuredClone');
    const projected = await db.projectRows(Items, (rows) => ({
      ids: rows.map((row) => row.id),
      count: rows.length,
    }));
    expect(clone).toHaveBeenCalledExactlyOnceWith({ ids: ['1', '2', '3', '4'], count: 4 });
    projected.ids[0] = 'changed';
    expect((await db.select().from(Items).where({ id: '1' })).rows).toHaveLength(1);
    await db.insert(Items).values({ id: '5' });
    expect(await db.projectRows(Items, (rows) => rows.length)).toBe(5);
  });

  it('isolates returned nested data and write-returning data from the cached snapshots', async () => {
    const first = await db.select().from(Items).where({ id: '1' });
    first.rows[0].payload = { corrupted: true };
    expect((await db.select().from(Items).where({ id: '1' })).rows).toEqual([initialRows[0]]);
    const linked = await db
      .with(registry, { parent: { owner: true } })
      .select()
      .from(Items);
    const parent = linked.rows[0].parent;
    expect(parent).toMatchObject({ owner: { name: 'Owner' } });
    linked.rows[0].parent = { owner: { name: 'corrupted' } };
    expect(
      (
        await db
          .with(registry, { parent: { owner: true } })
          .select()
          .from(Items)
      ).rows[0].parent,
    ).toEqual(parent);
    const input = { id: 'new', payload: { nested: ['value'] } };
    const inserted = await db.insert(Items).values(input).returning();
    input.payload.nested[0] = 'changed';
    inserted.rows[0].payload = {};
    expect((await db.select().from(Items).where({ id: 'new' })).rows[0].payload).toEqual({
      nested: ['value'],
    });
  });

  const selections = [
    [
      'filter/sort/page',
      (client: GitDB | CachedGitDb) =>
        client
          .select()
          .from(Items)
          .where(categoryFilter)
          .orderBy('value', 'desc')
          .offset(1)
          .limit(1),
    ],
    [
      'fields',
      (client: GitDB | CachedGitDb) =>
        client.select({ id: true, missing: true, payload: false }).from(Items).orderBy('category'),
    ],
    [
      'group/having',
      (client: GitDB | CachedGitDb) =>
        client.select().from(Items).groupBy('category').having(groupFilter).orderBy('$count'),
    ],
    [
      'default relations',
      (client: GitDB | CachedGitDb) => client.with({ role: true }).select().from(UserEntity),
    ],
    [
      'nested relations',
      (client: GitDB | CachedGitDb) =>
        client
          .with(registry, { parent: { owner: true, children: true } })
          .select()
          .from(Items),
    ],
    [
      'all relations',
      (client: GitDB | CachedGitDb) => client.with(registry).select().from(Parents),
    ],
    [
      'relation array',
      (client: GitDB | CachedGitDb) => client.with(registry, ['parent']).select().from(Items),
    ],
    [
      'disabled relation',
      (client: GitDB | CachedGitDb) =>
        client.with(registry, { parent: false }).select().from(Items),
    ],
  ] as const;

  it.each(selections)('preserves GitDB query results and state: %s', async (_name, select) => {
    expect(await select(db)).toEqual(await select(raw));
  });

  it('preserves aggregate behavior and empty results', async () => {
    expect(await db.$count(Items, [{ category: 'a' }, gte('value', 5)])).toBe(
      await raw.$count(Items, [{ category: 'a' }, gte('value', 5)]),
    );
    for (const method of ['$sum', '$avg', '$min', '$max'] as const) {
      expect(await db[method](Items, 'value', { category: 'a' })).toBe(
        await raw[method](Items, 'value', { category: 'a' }),
      );
      expect(await db[method](Items, 'value', { id: 'missing' })).toBe(
        await raw[method](Items, 'value', { id: 'missing' }),
      );
    }
  });

  it('persists insert/update/delete and immediately refreshes the entity cache', async () => {
    expect(await db.insert(Items).values({ id: 'new', value: 5 }).returning(['id'])).toMatchObject({
      rowCount: 1,
      rows: [{ id: 'new' }],
    });
    expect((await db.select().from(Items).where({ id: 'new' })).rows[0].value).toBe(5);
    expect(await db.update(Items).set({ value: 7 }).where({ id: 'new' }).returning()).toMatchObject(
      {
        rowCount: 1,
        rows: [{ id: 'new', value: 7 }],
      },
    );
    expect((await db.select().from(Items).where({ id: 'new' })).rows[0].value).toBe(7);
    expect((await raw.select().from(Items).where({ id: 'new' })).rows[0].value).toBe(7);
    await db.delete(Items).where({ id: 'new' }).returning();
    expect((await db.select().from(Items).where({ id: 'new' })).rows).toEqual([]);
    expect(JSON.parse(await readFile(path.join(dataPath, 'items.json'), 'utf8'))).toEqual(
      initialRows,
    );
  });

  it('serializes concurrent writes to the same entity and does not lose rows', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        db.insert(Items).values({ id: `parallel-${i}`, value: i }),
      ),
    );
    expect(await db.$count(Items)).toBe(14);
    expect(await raw.$count(Items)).toBe(14);
  });

  it('shares the cache across actor and relation scopes without losing audit attribution', async () => {
    const actor = { name: 'Scoped author', email: 'scoped@test.local' };
    await db.as(actor).insert(Items).values({ id: 'actor', value: 9 });
    expect((await db.select().from(Items).where({ id: 'actor' })).rows[0].value).toBe(9);
    await db.with(registry, { parent: true }).as(actor).update(Items).set({ value: 10 }).where({
      id: 'actor',
    });
    expect((await db.as(actor).select().from(Items).where({ id: 'actor' })).rows[0].value).toBe(10);
    await raw.close();
    expect((await db.auditLog()).events).toEqual(
      expect.arrayContaining([expect.objectContaining({ author: actor.name, entity: 'items' })]),
    );
  });

  it('logs cache failures, uses disk, and never serves stale cache after a failed cache refresh', async () => {
    vi.spyOn(cache, 'set').mockRejectedValueOnce(new Error('Redis unavailable'));
    await db.update(Items).set({ value: 99 }).where({ id: '1' });
    expect(logs.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'items' }),
      'cache write failed; subsequent reads will use GitDB',
    );
    expect((await db.select().from(Items).where({ id: '1' })).rows[0].value).toBe(99);
    vi.spyOn(cache, 'get').mockRejectedValueOnce(new Error('Redis unavailable'));
    expect(await db.$count(Items)).toBe(4);
    expect(logs.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'items' }),
      'cache read failed; reading GitDB',
    );
  });

  it('propagates persistence failures and invalidates snapshots even when disk changed before failure', async () => {
    const query = raw.update(Items);
    const execute = query.execute.bind(query);
    vi.spyOn(query, 'execute').mockImplementation(async () => {
      await execute();
      throw new Error('Failure after persistence');
    });
    vi.spyOn(raw, 'update').mockReturnValueOnce(query);
    await expect(db.update(Items).set({ value: 55 }).where({ id: '1' }).execute()).rejects.toThrow(
      'Failure after persistence',
    );
    expect((await db.select().from(Items).where({ id: '1' })).rows[0].value).toBe(55);
    await expect(db.insert(Items).values({ id: '1' }).execute()).rejects.toThrow();
  });

  it('preserves query errors, reset, catch and finally', async () => {
    await expect(db.select().execute()).rejects.toThrow('select().from');
    await expect(db.select().from(Items).having({ value: 4 }).execute()).rejects.toThrow(
      'having() requires groupBy',
    );
    const query = db.select().from(Items).where({ id: '1' }).limit(1);
    query.reset().from(Items);
    expect((await query).rows).toHaveLength(4);
    const finalized = vi.fn();
    await query.finally(finalized);
    expect(finalized).toHaveBeenCalledOnce();
    const caught = vi.fn();
    await db.select().catch(caught);
    expect(caught).toHaveBeenCalledOnce();
  });
});
