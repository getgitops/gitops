/**
 * A bucket (or a prefix of one) where an IaC tool keeps its state, configured once per
 * organization. GitOps only reads it (docs/adr/0003-state-iac.md).
 */

export const STATE_ENGINES = ['pulumi'] as const;
export type StateEngine = (typeof STATE_ENGINES)[number];

export const STATE_PROVIDERS = ['gcs', 's3'] as const;
export type StateProvider = (typeof STATE_PROVIDERS)[number];

/** `ambient`: ADC / Workload Identity / IAM role of the server. `credentials`: stored, encrypted. */
export const STATE_AUTH_MODES = ['ambient', 'credentials'] as const;
export type StateAuthMode = (typeof STATE_AUTH_MODES)[number];

export const MAX_BACKEND_NAME_LENGTH = 80;

/** Plain credentials, only ever held in memory on the server. */
export type GcsCredentials = { provider: 'gcs'; serviceAccountJson: string };
export type S3Credentials = {
  provider: 's3';
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};
export type StateBackendCredentials = GcsCredentials | S3Credentials;

export type StateBackendRow = {
  id: string;
  organizationId: string;
  name: string;
  engine: StateEngine;
  provider: StateProvider;
  bucket: string;
  /** Path inside the bucket that holds `.pulumi/`, without leading or trailing `/`. */
  prefix: string | null;
  region: string | null;
  /** S3-compatible endpoint (MinIO, R2…); `null` for AWS S3 and GCS. */
  endpoint: string | null;
  forcePathStyle: boolean;
  auth: StateAuthMode;
  /** `StateBackendCredentials` as JSON, encrypted (`credentials-cipher.ts`): never returned. */
  credentials: string | null;
  enabled: boolean;
  lastScanAt: string | null;
  /** Short reason of the last failed read (`access_denied`, `bucket_not_found`…). */
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What the API and the pages may show: never the credentials, only whether there are some. */
export type StateBackendView = Omit<StateBackendRow, 'credentials'> & { hasCredentials: boolean };

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? value : null;
}

const pick = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback;

export class StateBackendDomain implements StateBackendRow {
  id: string;
  organizationId: string;
  name: string;
  engine: StateEngine;
  provider: StateProvider;
  bucket: string;
  prefix: string | null;
  region: string | null;
  endpoint: string | null;
  forcePathStyle: boolean;
  auth: StateAuthMode;
  credentials: string | null;
  enabled: boolean;
  lastScanAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;

  constructor(row: Record<string, any>) {
    this.id = row.id;
    this.organizationId = row.organizationId;
    this.name = row.name ?? '';
    this.engine = pick(STATE_ENGINES, row.engine, 'pulumi');
    this.provider = pick(STATE_PROVIDERS, row.provider, 'gcs');
    this.bucket = row.bucket ?? '';
    this.prefix = row.prefix || null;
    this.region = row.region || null;
    this.endpoint = row.endpoint || null;
    this.forcePathStyle = row.forcePathStyle === true;
    this.auth = pick(STATE_AUTH_MODES, row.auth, 'ambient');
    this.credentials = row.credentials || null;
    this.enabled = row.enabled !== false;
    this.lastScanAt = toIso(row.lastScanAt);
    this.lastError = row.lastError ?? null;
    this.createdAt = toIso(row.createdAt) ?? new Date(0).toISOString();
    this.updatedAt = toIso(row.updatedAt) ?? this.createdAt;
  }

  /** Object key prefix of the Pulumi bookkeeping directory: `<prefix>/.pulumi/`. */
  get pulumiRoot(): string {
    return this.prefix ? `${this.prefix}/.pulumi/` : '.pulumi/';
  }

  /** `gs://bucket/prefix`, `s3://bucket/prefix`: display only. */
  get location(): string {
    const scheme = this.provider === 'gcs' ? 'gs' : 's3';
    return `${scheme}://${this.bucket}${this.prefix ? `/${this.prefix}` : ''}`;
  }

  toJson(): StateBackendRow {
    return {
      id: this.id,
      organizationId: this.organizationId,
      name: this.name,
      engine: this.engine,
      provider: this.provider,
      bucket: this.bucket,
      prefix: this.prefix,
      region: this.region,
      endpoint: this.endpoint,
      forcePathStyle: this.forcePathStyle,
      auth: this.auth,
      credentials: this.credentials,
      enabled: this.enabled,
      lastScanAt: this.lastScanAt,
      lastError: this.lastError,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toView(): StateBackendView {
    const { credentials, ...rest } = this.toJson();
    return { ...rest, hasCredentials: Boolean(credentials) };
  }
}

export class StateIacValidationError extends Error {
  /** Field → error code; the UI shows `stateIac.errors.<code>`. */
  constructor(readonly errors: Record<string, string>) {
    super(`Invalid State IaC configuration: ${Object.keys(errors).join(', ')}`);
    this.name = 'StateIacValidationError';
  }
}

export class StateBackendNotFoundError extends Error {
  constructor(id: string) {
    super(`State backend not found: ${id}`);
    this.name = 'StateBackendNotFoundError';
  }
}
