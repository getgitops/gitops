import type {
  IacHistoryPage,
  IacLock,
  IacSnapshot,
  IacSnapshotSource,
  IacUpdate,
} from '../../../domain/iac.model';
import { listAll, readText, type ObjectStore } from '../../object-store/object-store';
import type { EngineDiscovery, EngineStack, StateEngine } from '../state-engine';
import { discoverPulumi } from './pulumi-discovery';
import { parseCheckpoint, parseHistory } from './pulumi-state';

const HISTORY_FILE = /-(\d+)\.(history|checkpoint)\.json(?:\.gz|\.zst)?$/;
/** `<stack>.<unixnano>.json(.gz)` in backups/ */
const BACKUP_FILE = /\.(\d+)\.json(?:\.gz|\.zst)?$/;
const MAX_HISTORY_OBJECTS = 20_000;
const READ_CONCURRENCY = 4;

/** Paths of a stack's bookkeeping files in both layouts (docs/adr/0003-state-iac.md). */
export function pulumiPaths(root: string, stack: EngineStack) {
  const { project, stack: name, layout } = stack.ref;
  const scoped = layout === 'project' && project !== null;
  return {
    history: scoped ? `${root}history/${project}/${name}/` : `${root}history/${name}/`,
    // locks are keyed by the fully qualified name, `organization/` included
    locks: scoped ? `${root}locks/organization/${project}/${name}/` : `${root}locks/${name}/`,
    backups: scoped ? `${root}backups/${project}/${name}/` : `${root}backups/${name}/`,
  };
}

/** `<unixnano>` → ISO date. */
export function nanosToIso(nanos: string): string | null {
  try {
    return new Date(Number(BigInt(nanos) / 1_000_000n)).toISOString();
  } catch {
    return null;
  }
}

const byNanosDesc = (a: string, b: string) =>
  BigInt(b) > BigInt(a) ? 1 : BigInt(b) < BigInt(a) ? -1 : 0;

/** Pulumi DIY backend: `project` and legacy layouts, plain, `.gz` (and, listed only, `.zst`). */
export class PulumiStateEngine implements StateEngine {
  readonly kind = 'pulumi' as const;

  async discoverStacks(
    store: ObjectStore,
    root: string,
    backendId: string,
  ): Promise<EngineDiscovery> {
    const discovery = await discoverPulumi(store, root);
    const layout = discovery.layout === 'legacy' ? 'legacy' : 'project';
    return {
      layout: discovery.layout,
      metaVersion: discovery.metaVersion,
      truncated: discovery.truncated,
      stacks: discovery.projects.flatMap((project) =>
        project.stacks.map((stack) => ({
          ref: {
            backendId,
            engine: 'pulumi' as const,
            project: project.name,
            stack: stack.name,
            layout,
          },
          key: stack.key,
          size: stack.size,
          updatedAt: stack.updatedAt,
          version: stack.version,
        })),
      ),
    };
  }

  async readSnapshot(
    store: ObjectStore,
    _root: string,
    stack: EngineStack,
    options: { maxBytes: number },
  ): Promise<IacSnapshot> {
    const text = await readText(store, stack.key, options.maxBytes);
    if (text === null) throw new StackStateMissingError(stack.key);
    return parseCheckpoint(text, stack.ref, {
      source: 'current',
      versionId: stack.version,
      sizeBytes: Buffer.byteLength(text),
    });
  }

  async listUpdates(
    store: ObjectStore,
    root: string,
    stack: EngineStack,
    options: { limit: number; maxBytes: number },
  ): Promise<IacUpdate[]> {
    return (await this.listHistory(store, root, stack, options)).updates;
  }

  async listHistory(
    store: ObjectStore,
    root: string,
    stack: EngineStack,
    options: { limit: number; before?: string | null; maxBytes: number },
  ): Promise<IacHistoryPage> {
    const entries = await this.historyEntries(store, root, stack);
    const ids = [...entries.keys()]
      .filter((id) => entries.get(id)!.history)
      .filter((id) => !options.before || BigInt(id) < BigInt(options.before))
      .sort(byNanosDesc);
    const page = ids.slice(0, options.limit);

    const updates: IacUpdate[] = [];
    for (let i = 0; i < page.length; i += READ_CONCURRENCY) {
      const batch = await Promise.all(
        page.slice(i, i + READ_CONCURRENCY).map(async (id) => {
          const entry = entries.get(id)!;
          const text = await readText(store, entry.history!, options.maxBytes);
          return text === null ? null : parseHistory(text, id, Boolean(entry.checkpoint));
        }),
      );
      updates.push(...batch.filter((update): update is IacUpdate => update !== null));
    }
    return { updates, nextCursor: ids.length > page.length ? page[page.length - 1] : null };
  }

  /** `<unixnano>` → its `.history.json` and `.checkpoint.json` keys. */
  private async historyEntries(store: ObjectStore, root: string, stack: EngineStack) {
    const dir = pulumiPaths(root, stack).history;
    const { objects } = await listAll(store, dir, {
      delimiter: '/',
      maxObjects: MAX_HISTORY_OBJECTS,
    });
    const entries = new Map<string, { history?: string; checkpoint?: string; size: number }>();
    for (const object of objects) {
      const file = object.key.slice(dir.length);
      // `<stack>-<unixnano>.…`: the stack name may itself contain `-`
      if (!file.startsWith(`${stack.ref.stack}-`)) continue;
      const match = file.match(HISTORY_FILE);
      if (!match) continue;
      const entry = entries.get(match[1]) ?? { size: 0 };
      if (match[2] === 'history') entry.history = object.key;
      else {
        entry.checkpoint = object.key;
        entry.size = object.size;
      }
      entries.set(match[1], entry);
    }
    return entries;
  }

  async listSnapshotSources(
    store: ObjectStore,
    root: string,
    stack: EngineStack,
  ): Promise<IacSnapshotSource[]> {
    const paths = pulumiPaths(root, stack);
    const [entries, backups, siblings, versions] = await Promise.all([
      this.historyEntries(store, root, stack),
      listAll(store, paths.backups, { delimiter: '/', maxObjects: MAX_HISTORY_OBJECTS }),
      // retained copies (`<file>.<unixnano>`) and the `.bak` sit next to the live file
      listAll(store, stack.key, { maxObjects: MAX_HISTORY_OBJECTS }),
      store.listVersions(stack.key),
    ]);
    const sources: IacSnapshotSource[] = [
      {
        id: 'current',
        source: 'current',
        takenAt: stack.updatedAt,
        sizeBytes: stack.size,
        updateId: null,
      },
    ];
    for (const [id, entry] of entries) {
      if (!entry.checkpoint) continue;
      sources.push({
        id: `history:${id}`,
        source: 'history',
        takenAt: nanosToIso(id),
        sizeBytes: entry.size,
        updateId: entry.history ? id : null,
      });
    }
    for (const object of backups.objects) {
      const match = object.key.slice(paths.backups.length).match(BACKUP_FILE);
      if (!match) continue;
      sources.push({
        id: `backup:${match[1]}`,
        source: 'backup',
        takenAt: nanosToIso(match[1]),
        sizeBytes: object.size,
        updateId: null,
      });
    }
    for (const object of siblings.objects) {
      const suffix = object.key.slice(stack.key.length);
      const retained = suffix.match(/^\.(\d+)$/);
      if (retained) {
        sources.push({
          id: `retained:${retained[1]}`,
          source: 'retained',
          takenAt: nanosToIso(retained[1]),
          sizeBytes: object.size,
          updateId: null,
        });
      } else if (suffix === '.bak') {
        sources.push({
          id: 'previous',
          source: 'previous',
          takenAt: object.updatedAt,
          sizeBytes: object.size,
          updateId: null,
        });
      }
    }
    for (const version of versions) {
      if (version.latest) continue;
      sources.push({
        id: `version:${version.versionId}`,
        source: 'object-version',
        takenAt: version.updatedAt,
        sizeBytes: version.size,
        updateId: null,
      });
    }
    return sources.sort((a, b) =>
      a.id === 'current'
        ? -1
        : b.id === 'current'
          ? 1
          : (b.takenAt ?? '').localeCompare(a.takenAt ?? ''),
    );
  }

  async readSnapshotSource(
    store: ObjectStore,
    root: string,
    stack: EngineStack,
    sourceId: string,
    options: { maxBytes: number },
  ): Promise<IacSnapshot | null> {
    if (sourceId === 'current') return this.readSnapshot(store, root, stack, options);
    const [kind, id] = splitSource(sourceId);
    if (!id && kind !== 'previous') return null;
    const paths = pulumiPaths(root, stack);
    let key: string | null;
    let versionId: string | undefined;
    let source: IacSnapshot['source'];
    switch (kind) {
      case 'history': {
        if (!/^\d+$/.test(id)) return null;
        key = (await this.historyEntries(store, root, stack)).get(id)?.checkpoint ?? null;
        source = 'history';
        break;
      }
      case 'backup': {
        if (!/^\d+$/.test(id)) return null;
        const { objects } = await listAll(store, `${paths.backups}${stack.ref.stack}.${id}.json`);
        key = objects[0]?.key ?? null;
        source = 'backup';
        break;
      }
      case 'retained':
        if (!/^\d+$/.test(id)) return null;
        key = `${stack.key}.${id}`;
        source = 'retained';
        break;
      case 'previous':
        key = `${stack.key}.bak`;
        source = 'previous';
        break;
      case 'version':
        key = stack.key;
        versionId = id;
        source = 'object-version';
        break;
      default:
        return null;
    }
    if (!key) return null;
    const text = await readText(store, key, options.maxBytes, versionId);
    if (text === null) return null;
    return parseCheckpoint(text, stack.ref, {
      source,
      versionId: sourceId,
      sizeBytes: Buffer.byteLength(text),
    });
  }

  async readLock(store: ObjectStore, root: string, stack: EngineStack): Promise<IacLock | null> {
    const page = await store.list(pulumiPaths(root, stack).locks, { delimiter: '/', maxKeys: 10 });
    const lock = page.objects.find((object) => object.key.endsWith('.json'));
    if (!lock) return null;
    // only when it was taken: who holds it (user, host, pid) is not exposed
    const text = await readText(store, lock.key, 64 * 1024).catch(() => null);
    let since: string | null = lock.updatedAt;
    try {
      const parsed = text ? (JSON.parse(text) as { timestamp?: unknown }) : null;
      if (typeof parsed?.timestamp === 'string') since = parsed.timestamp;
    } catch {
      // a lock we can't read is still a lock
    }
    return { since };
  }
}

function splitSource(sourceId: string): [string, string] {
  const index = sourceId.indexOf(':');
  return index < 0 ? [sourceId, ''] : [sourceId.slice(0, index), sourceId.slice(index + 1)];
}

export class StackStateMissingError extends Error {
  constructor(key: string) {
    super(`State object disappeared: ${key}`);
    this.name = 'StackStateMissingError';
  }
}
