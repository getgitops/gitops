import { readdir } from 'node:fs/promises';
import { entity, type EntityRow, type GitDB } from '@getgitops/gitdb';
import { createLogger } from '../logger';

const log = createLogger('gitdb-cache');

/** Backends must be asynchronous and use repository-scoped keys (including for Redis). */
export interface EntityCache {
  get(key: string): Promise<EntityRow[] | undefined>;
  set(key: string, rows: EntityRow[]): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryEntityCache implements EntityCache {
  private readonly entries = new Map<string, EntityRow[]>();

  async get(key: string): Promise<EntityRow[] | undefined> {
    return this.entries.get(key);
  }

  async set(key: string, rows: EntityRow[]): Promise<void> {
    this.entries.set(key, rows);
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

export class CachedEntityStore {
  private readonly operations = new Map<string, Promise<unknown>>();
  private readonly valid = new Set<string>();

  constructor(
    private readonly db: GitDB,
    private readonly dataPath: string,
    private readonly cache: EntityCache = new MemoryEntityCache(),
  ) {}

  async warm(): Promise<void> {
    await this.db.ready();
    const startedAt = Date.now();
    let entities = 0;
    for (const file of await readdir(this.dataPath, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith('.json') || file.name === 'gitdb.manifest.json') {
        continue;
      }
      const name = file.name.slice(0, -5);
      // Startup always rebuilds from the clone, never from a previous backend's contents.
      await this.exclusive(name, () => this.reload(name));
      entities++;
    }
    log.info({ entities, durationMs: Date.now() - startedAt }, 'entity cache warmed');
  }

  /** Internal snapshots are read-only; query results must be cloned before exposing them. */
  read(name: string): Promise<EntityRow[]> {
    return this.exclusive(name, async () => {
      if (this.valid.has(name)) {
        try {
          const rows = await this.cache.get(this.key(name));
          if (rows !== undefined) return rows;
        } catch (err) {
          log.warn({ err, entity: name }, 'cache read failed; reading GitDB');
        }
      }
      return this.reload(name);
    });
  }

  write<T>(name: string, operation: () => Promise<T>): Promise<T> {
    return this.exclusive(name, async () => {
      // Do not trust the snapshot after a failed write: disk may already have changed.
      this.valid.delete(name);
      const result = await operation();
      await this.reload(name);
      return result;
    });
  }

  private async reload(name: string): Promise<EntityRow[]> {
    const { rows } = await this.db.select().from(entity(name, {}));
    try {
      await this.cache.set(this.key(name), rows);
      this.valid.add(name);
    } catch (err) {
      this.valid.delete(name);
      log.warn({ err, entity: name }, 'cache write failed; subsequent reads will use GitDB');
    }
    return rows;
  }

  private key(name: string): string {
    return JSON.stringify([this.dataPath, name]);
  }

  private async exclusive<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const pending = this.operations.get(name) ?? Promise.resolve();
    const current = pending.then(operation, operation);
    this.operations.set(name, current);
    try {
      return await current;
    } finally {
      if (this.operations.get(name) === current) this.operations.delete(name);
    }
  }
}
