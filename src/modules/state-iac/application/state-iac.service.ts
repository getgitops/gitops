import type { Logger } from 'pino';
import type { IacLock, IacSnapshot, IacStackSummary, IacUpdate } from '../domain/iac.model';
import type { StateBackendDomain } from '../domain/state-backend.domain';
import type { StateBindingDomain } from '../domain/state-binding.domain';
import type {
  EngineDiscovery,
  EngineStack,
  StateEngine,
} from '../infrastructure/engines/state-engine';
import type { StateBindingRepositoryPort } from '../infrastructure/repositories/state-binding.repository';
import type { StateIacConfig } from '../infrastructure/config';
import {
  readErrorCode,
  type BackendErrorCode,
  type StateBackendService,
} from './state-backend.service';

/** URL token of a legacy stack whose project is unknown (`~` is not valid in Pulumi names). */
export const UNKNOWN_PROJECT = '~';

export type StackListItem = IacStackSummary & {
  /** GitOps project the stack is assigned to (organization listings only). */
  assignedProjectId: string | null;
  /** The stack is listed but its state could not be read. */
  error: BackendErrorCode | null;
};

export type BackendStacks = {
  backend: {
    id: string;
    name: string;
    provider: string;
    location: string;
    lastError: string | null;
  };
  /** The bucket could not be read: the other backends are still listed. */
  error: BackendErrorCode | null;
  truncated: boolean;
  stacks: StackListItem[];
};

export type StackDetail = { summary: StackListItem; snapshot: IacSnapshot };

export type StateIacServiceOptions = {
  now?: () => number;
  logger?: Pick<Logger, 'warn'>;
  /** Bound of the in-memory state cache, in (raw state) bytes. */
  maxCacheBytes?: number;
};

type CachedDiscovery = { expires: number; value: EngineDiscovery | { error: BackendErrorCode } };
type CachedExtras = { expires: number; lastUpdate: IacUpdate | null; lock: IacLock | null };

const READ_CONCURRENCY = 4;
const DEFAULT_MAX_CACHE_BYTES = 256 * 1024 * 1024;
const silentLogger = { warn: () => {} } as unknown as Pick<Logger, 'warn'>;

/**
 * Reads the stacks of the backends (read-only) and decides who sees what: a GitOps project only
 * sees the stacks assigned to it; the organization sees all of them. Everything read is kept in
 * memory: listings for `cacheTtlMs`, states by object version (an unchanged state is never read
 * twice), bounded in bytes.
 */
export class StateIacService {
  private readonly discoveries = new Map<string, CachedDiscovery>();
  private readonly snapshots = new Map<string, IacSnapshot>();
  private snapshotBytes = 0;
  private readonly extras = new Map<string, CachedExtras>();
  private readonly now: () => number;
  private readonly log: Pick<Logger, 'warn'>;
  private readonly maxCacheBytes: number;

  constructor(
    private readonly backends: StateBackendService,
    private readonly bindings: StateBindingRepositoryPort,
    private readonly engine: StateEngine,
    private readonly config: () => StateIacConfig,
    options: StateIacServiceOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.log = options.logger ?? silentLogger;
    this.maxCacheBytes = options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES;
  }

  /** Stacks assigned to a GitOps project, grouped by backend. */
  async listProjectStacks(projectId: string, options: { refresh?: boolean } = {}) {
    const bindings = await this.bindings.listByProject(projectId);
    const byBackend = groupBy(bindings, (binding) => binding.backendId);
    const groups: BackendStacks[] = [];
    for (const [backendId, backendBindings] of byBackend) {
      const backend = await this.backends.get(backendId).catch(() => null);
      if (!backend || !backend.enabled) continue;
      groups.push(
        await this.listBackend(backend, options, (stack) =>
          backendBindings.some(
            (binding) =>
              binding.pulumiProject === stack.ref.project && binding.covers(stack.ref.stack),
          )
            ? projectId
            : undefined,
        ),
      );
    }
    return groups;
  }

  /** Every stack of the organization's backends, assigned or not. */
  async listOrganizationStacks(organizationId: string, options: { refresh?: boolean } = {}) {
    const backends = (await this.backends.list(organizationId)).filter((b) => b.enabled);
    const groups: BackendStacks[] = [];
    for (const backend of backends) {
      const bindings = await this.bindings.listByBackend(backend.id);
      groups.push(
        await this.listBackend(
          backend,
          options,
          (stack) => assignedTo(bindings, stack.ref.project, stack.ref.stack) ?? null,
        ),
      );
    }
    return groups;
  }

  /** A stack seen from a project: `null` (404) unless it is assigned to that project. */
  async getProjectStack(
    projectId: string,
    backendId: string,
    project: string,
    stack: string,
    options: { refresh?: boolean } = {},
  ): Promise<StackDetail | null> {
    const bindings = await this.bindings.listByProject(projectId);
    const visible = bindings.some(
      (binding) =>
        binding.backendId === backendId &&
        binding.pulumiProject === project &&
        binding.covers(stack),
    );
    if (!visible) return null;
    const backend = await this.backends.get(backendId).catch(() => null);
    if (!backend || !backend.enabled) return null;
    return this.detail(backend, project, stack, projectId, options);
  }

  /** A stack seen from its organization: any stack of its backends. */
  async getOrganizationStack(
    organizationId: string,
    backendId: string,
    project: string,
    stack: string,
    options: { refresh?: boolean } = {},
  ): Promise<StackDetail | null> {
    const backend = await this.backends.get(backendId).catch(() => null);
    if (!backend || backend.organizationId !== organizationId || !backend.enabled) return null;
    const bindings = await this.bindings.listByBackend(backend.id);
    const projectName = project === UNKNOWN_PROJECT ? null : project;
    return this.detail(
      backend,
      project,
      stack,
      assignedTo(bindings, projectName, stack) ?? null,
      options,
    );
  }

  /** Name and location of a backend, for headings. */
  async backendHead(
    backendId: string,
  ): Promise<{ id: string; name: string; location: string } | null> {
    const backend = await this.backends.get(backendId).catch(() => null);
    return backend ? { id: backend.id, name: backend.name, location: backend.location } : null;
  }

  /** Forgets everything read from a backend (after it changes, or on "Refresh"). */
  invalidate(backendId: string): void {
    for (const key of this.discoveries.keys())
      if (key.startsWith(`${backendId}:`)) this.discoveries.delete(key);
    for (const key of this.extras.keys())
      if (key.startsWith(`${backendId}|`)) this.extras.delete(key);
  }

  private async detail(
    backend: StateBackendDomain,
    project: string,
    stackName: string,
    assignedProjectId: string | null,
    options: { refresh?: boolean },
  ): Promise<StackDetail | null> {
    const discovery = await this.discover(backend, options);
    if ('error' in discovery) return null;
    const projectName = project === UNKNOWN_PROJECT ? null : project;
    const stack = discovery.stacks.find(
      (candidate) => candidate.ref.project === projectName && candidate.ref.stack === stackName,
    );
    if (!stack) return null;
    const summary = await this.summarize(backend, stack, assignedProjectId);
    if (summary.error) return { summary, snapshot: emptySnapshot(stack) };
    const snapshot = await this.snapshot(backend, stack);
    return { summary, snapshot };
  }

  private async listBackend(
    backend: StateBackendDomain,
    options: { refresh?: boolean },
    include: (stack: EngineStack) => string | null | undefined,
  ): Promise<BackendStacks> {
    const head = {
      id: backend.id,
      name: backend.name,
      provider: backend.provider,
      location: backend.location,
      lastError: backend.lastError,
    };
    const discovery = await this.discover(backend, options);
    if ('error' in discovery) {
      return {
        backend: { ...head, lastError: discovery.error },
        error: discovery.error,
        truncated: false,
        stacks: [],
      };
    }
    const selected = discovery.stacks.flatMap((stack) => {
      const assigned = include(stack);
      return assigned === undefined ? [] : [{ stack, assigned }];
    });
    const stacks: StackListItem[] = [];
    for (let i = 0; i < selected.length; i += READ_CONCURRENCY) {
      stacks.push(
        ...(await Promise.all(
          selected
            .slice(i, i + READ_CONCURRENCY)
            .map(({ stack, assigned }) => this.summarize(backend, stack, assigned)),
        )),
      );
    }
    return {
      backend: { ...head, lastError: null },
      error: null,
      truncated: discovery.truncated,
      stacks,
    };
  }

  private async discover(
    backend: StateBackendDomain,
    options: { refresh?: boolean },
  ): Promise<EngineDiscovery | { error: BackendErrorCode }> {
    // a backend whose connection changed (bucket, credentials…) is a different cache entry; its
    // `updatedAt` is not used: recording the scan outcome changes it
    const key = `${backend.id}:${connectionKey(backend)}`;
    if (options.refresh) this.invalidate(backend.id);
    const cached = this.discoveries.get(key);
    if (cached && cached.expires > this.now()) return cached.value;

    let value: EngineDiscovery | { error: BackendErrorCode };
    try {
      value = await this.engine.discoverStacks(
        this.backends.storeFor(backend),
        backend.pulumiRoot,
        backend.id,
      );
      await this.backends.reportRead(backend, null);
    } catch (error) {
      const code =
        error instanceof Error && /decrypt|encrypted credentials/i.test(error.message)
          ? 'undecryptable'
          : readErrorCode(error);
      this.log.warn({ backendId: backend.id, code }, '[state-iac] backend listing failed');
      await this.backends.reportRead(backend, code);
      value = { error: code };
    }
    this.discoveries.set(key, { expires: this.now() + this.config().cacheTtlMs, value });
    return value;
  }

  private async snapshot(backend: StateBackendDomain, stack: EngineStack): Promise<IacSnapshot> {
    // keyed by object version: an unchanged state is never read twice
    const key = `${backend.id}|${stack.key}|${stack.version ?? stack.updatedAt ?? ''}`;
    const cached = this.snapshots.get(key);
    if (cached) {
      this.snapshots.delete(key);
      this.snapshots.set(key, cached);
      return cached;
    }
    const snapshot = await this.engine.readSnapshot(
      this.backends.storeFor(backend),
      backend.pulumiRoot,
      stack,
      {
        maxBytes: this.config().maxStateBytes,
      },
    );
    this.snapshots.set(key, snapshot);
    this.snapshotBytes += snapshot.sizeBytes;
    for (const [oldKey, old] of this.snapshots) {
      if (this.snapshotBytes <= this.maxCacheBytes || oldKey === key) break;
      this.snapshots.delete(oldKey);
      this.snapshotBytes -= old.sizeBytes;
    }
    return snapshot;
  }

  private async summarize(
    backend: StateBackendDomain,
    stack: EngineStack,
    assignedProjectId: string | null,
  ): Promise<StackListItem> {
    const base: StackListItem = {
      ref: stack.ref,
      resourceCount: 0,
      updatedAt: stack.updatedAt,
      toolVersion: null,
      lastUpdate: null,
      lock: null,
      pendingOperations: 0,
      sizeBytes: stack.size,
      assignedProjectId,
      error: null,
    };
    try {
      const [snapshot, extras] = await Promise.all([
        this.snapshot(backend, stack),
        this.stackExtras(backend, stack),
      ]);
      return {
        ...base,
        // the stack resource itself is not one of "its" resources
        resourceCount: snapshot.resources.filter((r) => r.type !== 'pulumi:pulumi:Stack').length,
        updatedAt: snapshot.takenAt ?? stack.updatedAt,
        toolVersion: snapshot.toolVersion,
        pendingOperations: snapshot.pendingOperations,
        lastUpdate: extras.lastUpdate,
        lock: extras.lock,
      };
    } catch (error) {
      const code = readErrorCode(error);
      this.log.warn(
        { backendId: backend.id, stack: stack.ref.stack, code },
        '[state-iac] stack read failed',
      );
      return { ...base, error: code };
    }
  }

  private async stackExtras(backend: StateBackendDomain, stack: EngineStack) {
    const key = `${backend.id}|${stack.ref.project ?? UNKNOWN_PROJECT}|${stack.ref.stack}|${stack.version ?? ''}`;
    const cached = this.extras.get(key);
    if (cached && cached.expires > this.now()) return cached;
    const store = this.backends.storeFor(backend);
    const { maxStateBytes } = this.config();
    const [updates, lock] = await Promise.all([
      this.engine.listUpdates(store, backend.pulumiRoot, stack, {
        limit: 1,
        maxBytes: maxStateBytes,
      }),
      this.engine.readLock(store, backend.pulumiRoot, stack),
    ]);
    const value = {
      expires: this.now() + this.config().cacheTtlMs,
      lastUpdate: updates[0] ?? null,
      lock,
    };
    this.extras.set(key, value);
    return value;
  }
}

function assignedTo(bindings: StateBindingDomain[], project: string | null, stack: string) {
  if (project === null) return undefined;
  return bindings.find((binding) => binding.pulumiProject === project && binding.covers(stack))
    ?.projectId;
}

function connectionKey(backend: StateBackendDomain): string {
  const { provider, bucket, prefix, region, endpoint, forcePathStyle, auth, credentials } = backend;
  return JSON.stringify([
    provider,
    bucket,
    prefix,
    region,
    endpoint,
    forcePathStyle,
    auth,
    credentials,
  ]);
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

function emptySnapshot(stack: EngineStack): IacSnapshot {
  return {
    ref: stack.ref,
    source: 'current',
    versionId: stack.version,
    takenAt: null,
    toolVersion: null,
    resources: [],
    outputs: {},
    pendingOperations: 0,
    sizeBytes: 0,
  };
}
