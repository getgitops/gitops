import type { IacLock, IacSnapshot, IacUpdate } from '../../../domain/iac.model';
import { listAll, readText, type ObjectStore } from '../../object-store/object-store';
import type { EngineDiscovery, EngineStack, StateEngine } from '../state-engine';
import { discoverPulumi } from './pulumi-discovery';
import { parseCheckpoint, parseHistory } from './pulumi-state';

const HISTORY_FILE = /-(\d+)\.(history|checkpoint)\.json(?:\.gz|\.zst)?$/;
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
  };
}

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
    const dir = pulumiPaths(root, stack).history;
    const { objects } = await listAll(store, dir, {
      delimiter: '/',
      maxObjects: MAX_HISTORY_OBJECTS,
    });
    const entries = new Map<string, { history?: string; checkpoint: boolean }>();
    for (const object of objects) {
      const file = object.key.slice(dir.length);
      // `<stack>-<unixnano>.…`: the stack name may itself contain `-`
      if (!file.startsWith(`${stack.ref.stack}-`)) continue;
      const match = file.match(HISTORY_FILE);
      if (!match) continue;
      const entry = entries.get(match[1]) ?? { checkpoint: false };
      if (match[2] === 'history') entry.history = object.key;
      else entry.checkpoint = true;
      entries.set(match[1], entry);
    }
    const ids = [...entries.entries()]
      .filter(([, entry]) => entry.history)
      // unixnano ids have the same length for centuries: compare as numbers anyway
      .sort(([a], [b]) => (BigInt(b) > BigInt(a) ? 1 : BigInt(b) < BigInt(a) ? -1 : 0))
      .slice(0, options.limit);

    const updates: IacUpdate[] = [];
    for (let i = 0; i < ids.length; i += READ_CONCURRENCY) {
      const batch = await Promise.all(
        ids.slice(i, i + READ_CONCURRENCY).map(async ([id, entry]) => {
          const text = await readText(store, entry.history!, options.maxBytes);
          return text === null ? null : parseHistory(text, id, entry.checkpoint);
        }),
      );
      updates.push(...batch.filter((update): update is IacUpdate => update !== null));
    }
    return updates;
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

export class StackStateMissingError extends Error {
  constructor(key: string) {
    super(`State object disappeared: ${key}`);
    this.name = 'StackStateMissingError';
  }
}
