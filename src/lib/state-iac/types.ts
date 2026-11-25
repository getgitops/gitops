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

/** `<base>/<backendId>/<project|~>/<stack>` */
export function stackPath(base: string, ref: StackSummaryView['ref']): string {
  return `${base}/${ref.backendId}/${encodeURIComponent(ref.project ?? UNKNOWN_PROJECT)}/${encodeURIComponent(ref.stack)}`;
}

export function isSpecial(value: unknown): value is Extract<IacValue, { $iac: string }> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    '$iac' in (value as object)
  );
}
