/**
 * Client-safe shapes of the State IaC views (mirrors `$modules/state-iac` without importing
 * server code). Secret values are already `{ $iac: 'secret' }` here.
 */
export type IacValue =
  | null
  | boolean
  | number
  | string
  | IacValue[]
  | { [key: string]: IacValue }
  | { $iac: 'secret' }
  | { $iac: 'resource-ref'; address: string; id?: string }
  | { $iac: 'asset' | 'archive'; summary: string }
  | { $iac: 'unknown' };

export type IacResourceView = {
  address: string;
  type: string;
  name: string;
  parent: string | null;
  provider: string | null;
  providerType: string | null;
  externalId: string | null;
  managed: boolean;
  flags: {
    protect: boolean;
    retainOnDelete: boolean;
    external: boolean;
    pendingReplacement: boolean;
    pendingDelete: boolean;
  };
  inputs: Record<string, IacValue>;
  outputs: Record<string, IacValue>;
  dependencies: string[];
  createdAt: string | null;
  modifiedAt: string | null;
};

export type IacUpdateView = {
  id: string;
  kind: string;
  result: 'succeeded' | 'failed' | 'in-progress' | 'unknown';
  startedAt: string | null;
  endedAt: string | null;
  message: string;
  changes: Record<string, number>;
  toolVersion: string | null;
  vcs: {
    kind: string | null;
    owner: string | null;
    repo: string | null;
    commit: string | null;
    branch: string | null;
    dirty: boolean | null;
    author: string | null;
  };
};

export type IacHistoryPageView = {
  updates: (IacUpdateView & {
    snapshotAvailable: boolean;
    config: Record<string, IacValue>;
    execKind: string | null;
  })[];
  nextCursor: string | null;
};

export type IacSnapshotSourceView = {
  id: string;
  source: 'current' | 'history' | 'backup' | 'retained' | 'previous' | 'object-version';
  takenAt: string | null;
  sizeBytes: number;
  updateId: string | null;
};

export type IacFieldChangeView = {
  path: string;
  before?: IacValue;
  after?: IacValue;
  secret: boolean;
};

export type IacResourceChangeView = {
  address: string;
  type: string;
  name: string;
  change: 'create' | 'delete' | 'update' | 'replace';
  providerOnly: boolean;
  fields: IacFieldChangeView[];
};

export type DiffOutcomeView = {
  diff: {
    from: { sourceId: string | null; takenAt: string | null };
    to: { sourceId: string | null; takenAt: string | null };
    summary: Record<'create' | 'delete' | 'update' | 'replace' | 'same' | 'providerOnly', number>;
    resources: IacResourceChangeView[];
    outputs: IacFieldChangeView[];
  } | null;
  sources: IacSnapshotSourceView[];
  from: string | null;
  to: string | null;
};

export type StackSummaryView = {
  ref: {
    backendId: string;
    engine: string;
    project: string | null;
    stack: string;
    layout: 'project' | 'legacy';
  };
  resourceCount: number;
  updatedAt: string | null;
  toolVersion: string | null;
  lastUpdate: IacUpdateView | null;
  lock: { since: string | null } | null;
  pendingOperations: number;
  sizeBytes: number;
  assignedProjectId: string | null;
  error: string | null;
};

export type BackendStacksView = {
  backend: {
    id: string;
    name: string;
    provider: string;
    location: string;
    lastError: string | null;
  };
  error: string | null;
  truncated: boolean;
  stacks: StackSummaryView[];
};

export type StackDetailView = {
  summary: StackSummaryView;
  backend: { id: string; name: string; location: string };
  resources?: IacResourceView[];
  outputs?: Record<string, IacValue>;
};

/** URL token of a legacy stack whose project is unknown. */
export const UNKNOWN_PROJECT = '~';

export function isSpecial(value: unknown): value is Extract<IacValue, { $iac: string }> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    '$iac' in (value as object)
  );
}

export type StackHealthView = {
  level: 'ok' | 'warn' | 'critical';
  reasons: (
    | 'read_error'
    | 'backend_error'
    | 'last_update_failed'
    | 'pending_operations'
    | 'stale_lock'
    | 'inactive'
  )[];
};

export type StackDashboardView = {
  health: StackHealthView;
  resources: {
    total: number;
    managed: number;
    components: number;
    protected: number;
    pendingChange: number;
    topTypes: { type: string; count: number }[];
    otherCount: number;
    byProvider: { provider: string; count: number }[];
  } | null;
  lastUpdate: IacUpdateView | null;
  deployments: {
    recent: IacUpdateView[];
    window: { days: number; total: number; succeeded: number; rate: number | null };
    perWeek: number | null;
    weeks: { start: string; succeeded: number; failed: number }[];
  } | null;
  lastChanges: {
    summary: Record<'create' | 'delete' | 'update' | 'replace' | 'same' | 'providerOnly', number>;
    resources: {
      address: string;
      type: string;
      name: string;
      change: 'create' | 'delete' | 'update' | 'replace';
      paths: string[];
    }[];
    moreCount: number;
    providerOnlyCount: number;
    from: string | null;
    to: string | null;
  } | null;
  updateChanges: Record<string, number> | null;
};

type EnvironmentRefView = { project: string | null; stack: string };

export type EnvironmentWarningView =
  | { kind: 'version_drift'; stacks: (EnvironmentRefView & { version: string })[] }
  | { kind: 'stack_failed'; stack: EnvironmentRefView; at: string | null }
  | { kind: 'stale_lock'; stack: EnvironmentRefView; since: string };

/** A stack of the project in the selector and the "Entornos" strip. */
export type EnvironmentView = {
  /** `<backendId>/<project|~>/<stack>` (each part URL-encoded): the `?stack=` value. */
  key: string;
  project: string | null;
  stack: string;
  health: StackHealthView;
  resourceCount: number;
  lastUpdate: { result: IacUpdateView['result']; at: string | null } | null;
  updatedAt: string | null;
  error: string | null;
};

/** `<backendId>/<project|~>/<stack>` with each part URL-encoded. */
export function stackKey(ref: { backendId: string; project: string | null; stack: string }) {
  const part = encodeURIComponent;
  return `${part(ref.backendId)}/${part(ref.project ?? UNKNOWN_PROJECT)}/${part(ref.stack)}`;
}

export function parseStackKey(
  value: string | null,
): { backendId: string; project: string; stack: string } | null {
  const parts = value?.split('/') ?? [];
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  try {
    const [backendId, project, stack] = parts.map((part) => decodeURIComponent(part));
    return { backendId, project, stack };
  } catch {
    return null;
  }
}

/** Streamed with the project page: the stack list, which stack is selected and the warnings. */
export type StackListing =
  | { kind: 'empty' }
  | { kind: 'notfound' }
  | { kind: 'error'; code: string }
  | {
      kind: 'ready';
      environments: EnvironmentView[];
      selectedKey: string;
      backend: { id: string; name: string; location: string; lastError: string | null };
      locked: boolean;
      warnings: EnvironmentWarningView[];
    };

/** Streamed after the listing: the selected stack's detail and dashboard. */
export type StackPanel =
  | { kind: 'none' }
  | { kind: 'error'; code: string }
  | {
      kind: 'ready';
      detail: StackDetailView;
      dashboard: StackDashboardView;
      apiBase: string;
      scopeQuery: string;
    };
