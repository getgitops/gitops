import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { ListOptions, ListPage, ObjectInfo, ObjectStore } from './object-store';

type StoredObject = { body: Buffer; updatedAt: string; version: number };

/** Bucket in memory for tests: same listing semantics as GCS/S3 (sorted keys, delimiter, pages). */
export class InMemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, StoredObject>();
  /** Every call, to assert that nothing lists the whole bucket or writes. */
  readonly calls: Array<{ op: 'list' | 'head' | 'get'; key: string }> = [];
  /** Makes every call fail with this error (simulates a denied or missing bucket). */
  failWith: unknown = null;

  constructor(private readonly pageSize = 1000) {}

  /** Loads a directory as bucket content: `<dir>/a/b.json` becomes `<keyPrefix>a/b.json`. */
  static fromDirectory(dir: string, keyPrefix = ''): InMemoryObjectStore {
    const store = new InMemoryObjectStore();
    const walk = (current: string) => {
      for (const entry of readdirSync(current)) {
        const path = join(current, entry);
        if (statSync(path).isDirectory()) walk(path);
        else store.put(keyPrefix + relative(dir, path).split(sep).join('/'), readFileSync(path));
      }
    };
    walk(dir);
    return store;
  }

  put(key: string, body: string | Buffer, updatedAt = new Date().toISOString()): void {
    const previous = this.objects.get(key);
    this.objects.set(key, {
      body: typeof body === 'string' ? Buffer.from(body) : body,
      updatedAt,
      version: (previous?.version ?? 0) + 1,
    });
  }

  private check() {
    if (this.failWith) throw this.failWith;
  }

  private info(key: string, object: StoredObject): ObjectInfo {
    return {
      key,
      size: object.body.length,
      updatedAt: object.updatedAt,
      version: String(object.version),
    };
  }

  async list(prefix: string, options: ListOptions = {}): Promise<ListPage> {
    this.calls.push({ op: 'list', key: prefix });
    this.check();
    const pageSize = options.maxKeys ?? this.pageSize;
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();

    // entries (objects and folded prefixes) in key order, so pages are stable
    const entries: Array<{ object?: ObjectInfo; prefix?: string; sortKey: string }> = [];
    const seen = new Set<string>();
    for (const key of keys) {
      const rest = key.slice(prefix.length);
      const slash = options.delimiter ? rest.indexOf(options.delimiter) : -1;
      if (slash >= 0) {
        const folded = prefix + rest.slice(0, slash + 1);
        if (!seen.has(folded)) {
          seen.add(folded);
          entries.push({ prefix: folded, sortKey: folded });
        }
      } else {
        entries.push({ object: this.info(key, this.objects.get(key)!), sortKey: key });
      }
    }

    const start = options.pageToken
      ? entries.findIndex((entry) => entry.sortKey > options.pageToken!)
      : 0;
    const page = start < 0 ? [] : entries.slice(start, start + pageSize);
    const more = start >= 0 && start + pageSize < entries.length;
    return {
      objects: page.flatMap((entry) => (entry.object ? [entry.object] : [])),
      prefixes: page.flatMap((entry) => (entry.prefix ? [entry.prefix] : [])),
      nextPageToken: more ? page[page.length - 1].sortKey : null,
    };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    this.calls.push({ op: 'head', key });
    this.check();
    const object = this.objects.get(key);
    return object ? this.info(key, object) : null;
  }

  async openRead(key: string): Promise<Readable | null> {
    this.calls.push({ op: 'get', key });
    this.check();
    const object = this.objects.get(key);
    if (!object) return null;
    // small chunks, so stream handling (gzip detection, size limits) is really exercised
    const body = object.body;
    return Readable.from(
      (function* () {
        for (let i = 0; i < body.length; i += 16 * 1024) yield body.subarray(i, i + 16 * 1024);
      })(),
    );
  }
}
