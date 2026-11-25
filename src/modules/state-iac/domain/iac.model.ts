/**
 * Normalized IaC model (docs/adr/0003-state-iac.md). Nothing here is Pulumi-specific: engines
 * translate their tool's format into it, so Terraform can be one more engine. Secrets are masked
 * before a value reaches this model: it never holds ciphertexts nor plain secret values.
 */

export type IacEngineKind = 'pulumi';

/** A JSON value with the special values of the tools made explicit. */
export type IacValue =
  null | boolean | number | string | IacValue[] | { [key: string]: IacValue } | IacSpecialValue;

export type IacSpecialValue =
  | { $iac: 'secret' }
  | { $iac: 'resource-ref'; address: string; id?: string }
  | { $iac: 'asset' | 'archive'; summary: string }
  | { $iac: 'unknown' };

export function isSpecialValue(value: unknown): value is IacSpecialValue {
  return Boolean(value) && typeof value === 'object' && '$iac' in (value as object);
}

/** Where a stack lives: a backend, a tool project (`null`: legacy, unknown) and the stack name. */
export type IacStackRef = {
  backendId: string;
  engine: IacEngineKind;
  project: string | null;
  stack: string;
  layout: 'project' | 'legacy';
};

export type IacResource = {
  /** Pulumi URN; a Terraform resource address later. */
  address: string;
  type: string;
  name: string;
  parent: string | null;
  /** Provider address, without the trailing `::<id>`. */
  provider: string | null;
  /** Provider package (`gcp`, `aws`…) or `null` for components. */
  providerType: string | null;
  /** Cloud id. */
  externalId: string | null;
  /** A cloud resource (vs a component that only groups others). */
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
  /** Sorted, de-duplicated. */
  dependencies: string[];
  createdAt: string | null;
  modifiedAt: string | null;
};

export type IacSnapshot = {
  ref: IacStackRef;
  source: 'current' | 'history' | 'backup' | 'retained' | 'previous' | 'object-version';
  /** Object version (ETag / generation) or `<unixnano>` of a history entry. */
  versionId: string | null;
  takenAt: string | null;
  toolVersion: string | null;
  resources: IacResource[];
  /** Outputs of the stack (the root resource). */
  outputs: Record<string, IacValue>;
  pendingOperations: number;
  sizeBytes: number;
};

export type IacUpdateKind = 'update' | 'refresh' | 'destroy' | 'import' | 'rename' | 'other';

export type IacUpdate = {
  /** `<unixnano>` of the history file. */
  id: string;
  kind: IacUpdateKind;
  result: 'succeeded' | 'failed' | 'in-progress' | 'unknown';
  startedAt: string | null;
  endedAt: string | null;
  message: string;
  changes: Partial<Record<'create' | 'update' | 'delete' | 'replace' | 'same' | 'import', number>>;
  toolVersion: string | null;
  /** Allow-listed environment only: never emails nor local paths. */
  vcs: {
    kind: string | null;
    owner: string | null;
    repo: string | null;
    commit: string | null;
    branch: string | null;
    dirty: boolean | null;
    author: string | null;
  };
  execKind: string | null;
  /** Stack configuration; secret values masked. */
  config: Record<string, IacValue>;
  snapshotAvailable: boolean;
};

/** An operation in progress on the stack (the tool's lock). Who holds it is not exposed. */
export type IacLock = { since: string | null };

export type IacStackSummary = {
  ref: IacStackRef;
  resourceCount: number;
  updatedAt: string | null;
  toolVersion: string | null;
  lastUpdate: IacUpdate | null;
  lock: IacLock | null;
  pendingOperations: number;
  sizeBytes: number;
};
