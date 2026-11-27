import type {
  IacResource,
  IacSnapshot,
  IacStackRef,
  IacUpdate,
  IacUpdateKind,
  IacValue,
} from '../../../domain/iac.model';

/**
 * Pulumi checkpoint (`version: 3`) and history entry → normalized model. Secret values are
 * replaced by `{ $iac: 'secret' }` while walking the JSON, so neither ciphertexts nor
 * `secrets_providers` ever leave this file. Format notes: docs/adr/0003-state-iac.md.
 */

/** Pulumi tags special values with this key (`sig.Key`). */
const SIG_KEY = '4dabf18193072939515e22adb298388d';
const SIG_SECRET = '1b47061264138c4ac30d75fd1eb44270';
const SIG_RESOURCE_REF = '5cf8f73096256a8f31e491e813e4eb8e';
const SIG_ASSET = 'c44067f5952c0a294b673a41bacd8c17';
const SIG_ARCHIVE = '0def7320c3a5731c473e5ecbe6d01bc7';
const SIG_OUTPUT = 'd0e6a833031e9bbcd3f4e8bde6ca49a4';
/** Unknown values of a preview. */
const UNKNOWN = '04da6b54-80e4-46f7-96ec-b56ff0331ba9';

export const MAX_CHECKPOINT_VERSION = 3;

export class UnsupportedStateVersionError extends Error {
  constructor(readonly version: number) {
    super(`Pulumi checkpoint version ${version} is not supported`);
    this.name = 'UnsupportedStateVersionError';
  }
}

export class InvalidStateError extends Error {
  constructor(message = 'The state file is not valid JSON') {
    super(message);
    this.name = 'InvalidStateError';
  }
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isObject = (value: unknown): value is Record<string, Json> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Internal keys of the providers (bridge private state, raw deltas): noise for people. */
const isInternalKey = (key: string) => key.startsWith('__');

/** Pulumi value → `IacValue`, masking every secret. */
export function normalizeValue(value: unknown): IacValue {
  if (value === UNKNOWN) return { $iac: 'unknown' };
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item));
  if (!isObject(value)) {
    return typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
      ? value
      : null;
  }

  const sig = value[SIG_KEY];
  if (sig !== undefined) {
    switch (sig) {
      case SIG_RESOURCE_REF:
        return {
          $iac: 'resource-ref',
          address: typeof value.urn === 'string' ? value.urn : '',
          ...(typeof value.id === 'string' && value.id ? { id: value.id } : {}),
        };
      case SIG_ASSET:
        return { $iac: 'asset', summary: summaryOf(value, ['path', 'uri', 'hash']) };
      case SIG_ARCHIVE:
        return { $iac: 'archive', summary: summaryOf(value, ['path', 'uri', 'hash']) };
      case SIG_OUTPUT:
        if (value.secret === true) return { $iac: 'secret' };
        return 'value' in value ? normalizeValue(value.value) : { $iac: 'unknown' };
      // SIG_SECRET and any signature we don't know: never show what is inside
      case SIG_SECRET:
      default:
        return { $iac: 'secret' };
    }
  }
  // defensive: an encrypted value without its signature is still a secret
  if ('ciphertext' in value) return { $iac: 'secret' };

  const out: Record<string, IacValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!isInternalKey(key)) out[key] = normalizeValue(item);
  }
  return out;
}

function summaryOf(value: Record<string, Json>, keys: string[]): string {
  for (const key of keys) {
    const item = value[key];
    if (typeof item === 'string' && item)
      return key === 'hash' ? `sha256:${item.slice(0, 12)}` : item;
  }
  return '';
}

function normalizeMap(value: unknown): Record<string, IacValue> {
  const normalized = normalizeValue(value ?? {});
  return isObject(normalized) && !('$iac' in normalized)
    ? (normalized as Record<string, IacValue>)
    : {};
}

/** `urn:pulumi:prod::proj::parent$type::name` → `name`. */
export function nameFromUrn(urn: string): string {
  const index = urn.lastIndexOf('::');
  return index >= 0 ? urn.slice(index + 2) : urn;
}

/** Package of a type: `gcp:storage/bucket:Bucket` → `gcp`, `pulumi:providers:aws` → `aws`. */
export function packageOf(type: string): string | null {
  if (type.startsWith('pulumi:providers:')) return type.slice('pulumi:providers:'.length) || null;
  if (type.startsWith('pulumi:')) return null;
  const pkg = type.split(':')[0];
  return pkg || null;
}

const STACK_TYPE = 'pulumi:pulumi:Stack';

function toResource(raw: Record<string, Json>): IacResource {
  const urn = typeof raw.urn === 'string' ? raw.urn : '';
  const type = typeof raw.type === 'string' ? raw.type : '';
  const managed = raw.custom === true;
  const provider =
    typeof raw.provider === 'string' && raw.provider
      ? raw.provider.split('::').slice(0, -1).join('::') || raw.provider
      : null;
  const dependencies = Array.isArray(raw.dependencies)
    ? [...new Set(raw.dependencies.filter((d): d is string => typeof d === 'string'))].sort()
    : [];
  const text = (value: Json | undefined) => (typeof value === 'string' && value ? value : null);
  return {
    address: urn,
    type,
    name: nameFromUrn(urn),
    parent: text(raw.parent),
    provider,
    providerType: managed || type.startsWith('pulumi:providers:') ? packageOf(type) : null,
    externalId: text(raw.id),
    managed,
    flags: {
      protect: raw.protect === true,
      retainOnDelete: raw.retainOnDelete === true,
      external: raw.external === true,
      pendingReplacement: raw.pendingReplacement === true,
      pendingDelete: raw.delete === true,
    },
    inputs: normalizeMap(raw.inputs),
    outputs: normalizeMap(raw.outputs),
    dependencies,
    createdAt: text(raw.created),
    modifiedAt: text(raw.modified),
  };
}

export type SnapshotMeta = {
  source: IacSnapshot['source'];
  versionId: string | null;
  sizeBytes: number;
};

/** Parses a checkpoint file (`stacks/…json`, `history/…checkpoint.json`, `backups/…`). */
export function parseCheckpoint(text: string, ref: IacStackRef, meta: SnapshotMeta): IacSnapshot {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new InvalidStateError();
  }
  if (!isObject(json)) throw new InvalidStateError('The state file is not an object');
  const version = typeof json.version === 'number' ? json.version : 0;
  if (version > MAX_CHECKPOINT_VERSION) throw new UnsupportedStateVersionError(version);

  const latest =
    isObject(json.checkpoint) && isObject(json.checkpoint.latest) ? json.checkpoint.latest : {};
  const manifest = isObject(latest.manifest) ? latest.manifest : {};
  const rawResources = Array.isArray(latest.resources) ? latest.resources.filter(isObject) : [];
  const resources = rawResources.map(toResource);
  const stack = resources.find((resource) => resource.type === STACK_TYPE && !resource.parent);
  // `secrets_providers` (salt, KMS key) is deliberately never read
  return {
    ref,
    source: meta.source,
    versionId: meta.versionId,
    takenAt: typeof manifest.time === 'string' ? manifest.time : null,
    toolVersion: typeof manifest.version === 'string' ? manifest.version : null,
    resources,
    outputs: stack ? stack.outputs : {},
    pendingOperations: Array.isArray(latest.pending_operations)
      ? latest.pending_operations.length
      : 0,
    sizeBytes: meta.sizeBytes,
  };
}

const KINDS: Record<string, IacUpdateKind> = {
  update: 'update',
  refresh: 'refresh',
  destroy: 'destroy',
  import: 'import',
  'resource-import': 'import',
  rename: 'rename',
};

/** Config values: `{ secure: 'v1:…' }` is a secret config value. */
function normalizeConfig(value: unknown): IacValue {
  if (Array.isArray(value)) return value.map(normalizeConfig);
  if (isObject(value)) {
    if ('secure' in value) return { $iac: 'secret' };
    const out: Record<string, IacValue> = {};
    for (const [key, item] of Object.entries(value)) out[key] = normalizeConfig(item);
    return out;
  }
  return normalizeValue(value);
}

const seconds = (value: Json | undefined) =>
  typeof value === 'number' && value > 0 ? new Date(value * 1000).toISOString() : null;

/**
 * Parses a `*.history.json`. Only an allow-list of `environment` leaves this function: no emails,
 * no local paths, no hostnames.
 */
export function parseHistory(text: string, id: string, snapshotAvailable: boolean): IacUpdate {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new InvalidStateError('The history entry is not valid JSON');
  }
  if (!isObject(json)) throw new InvalidStateError('The history entry is not an object');
  const env = isObject(json.environment) ? json.environment : {};
  const envText = (key: string) =>
    typeof env[key] === 'string' && env[key] ? (env[key] as string) : null;
  const result = json.result;
  const changes: IacUpdate['changes'] = {};
  if (isObject(json.resourceChanges)) {
    for (const [key, count] of Object.entries(json.resourceChanges)) {
      if (
        typeof count === 'number' &&
        ['create', 'update', 'delete', 'replace', 'same', 'import'].includes(key)
      ) {
        changes[key as keyof IacUpdate['changes']] = count;
      }
    }
  }
  const dirty = envText('git.dirty');
  return {
    id,
    kind: KINDS[String(json.kind)] ?? 'other',
    result:
      result === 'succeeded' || result === 'failed' || result === 'in-progress'
        ? result
        : 'unknown',
    startedAt: seconds(json.startTime),
    endedAt: seconds(json.endTime),
    message: typeof json.message === 'string' ? json.message : '',
    changes,
    toolVersion: envText('pulumi.version'),
    vcs: {
      kind: envText('vcs.kind'),
      owner: envText('vcs.owner'),
      repo: envText('vcs.repo'),
      commit: envText('git.head'),
      branch: envText('git.headName')?.replace(/^refs\/heads\//, '') ?? null,
      dirty: dirty === null ? null : dirty === 'true',
      author: envText('git.author'),
    },
    execKind: envText('exec.kind'),
    config: isObject(json.config) ? (normalizeConfig(json.config) as Record<string, IacValue>) : {},
    snapshotAvailable,
  };
}
