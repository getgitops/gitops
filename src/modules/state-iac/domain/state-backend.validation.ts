import { isIP } from 'node:net';
import {
  MAX_BACKEND_NAME_LENGTH,
  STATE_AUTH_MODES,
  STATE_ENGINES,
  STATE_PROVIDERS,
  type StateAuthMode,
  type StateBackendCredentials,
  type StateEngine,
  type StateProvider,
} from './state-backend.domain';

/** Field → error code (`stateIac.errors.<code>`). */
export type FieldErrors = Record<string, string>;

const BUCKET_PATTERN = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;
const REGION_PATTERN = /^[a-z0-9-]{2,40}$/;
const MAX_PREFIX_LENGTH = 512;

export function validateName(value: unknown, errors: FieldErrors): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) errors.name = 'required';
  else if (name.length > MAX_BACKEND_NAME_LENGTH) errors.name = 'too_long';
  return name;
}

export function validateEngine(value: unknown, errors: FieldErrors): StateEngine {
  if (value === undefined || value === null || value === '') return 'pulumi';
  if (!STATE_ENGINES.includes(value as StateEngine)) errors.engine = 'invalid_engine';
  return 'pulumi';
}

export function validateProvider(value: unknown, errors: FieldErrors): StateProvider | null {
  if (STATE_PROVIDERS.includes(value as StateProvider)) return value as StateProvider;
  errors.provider = typeof value === 'string' && value ? 'invalid_provider' : 'required';
  return null;
}

export function validateBucket(value: unknown, errors: FieldErrors): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  // accept `gs://bucket` and `s3://bucket` as typed in the consoles
  const bucket = raw.replace(/^(gs|s3):\/\//, '').replace(/\/+$/, '');
  if (!bucket) errors.bucket = 'required';
  else if (!BUCKET_PATTERN.test(bucket) || bucket.includes('..')) errors.bucket = 'invalid_bucket';
  return bucket;
}

/** `infra/`, `/infra`, `infra/.pulumi` → `infra`; empty → `null` (bucket root). */
export function validatePrefix(value: unknown, errors: FieldErrors): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    errors.prefix = 'invalid_prefix';
    return null;
  }
  const prefix = value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/(^|\/)\.pulumi$/, '')
    .replace(/\/+$/, '');
  if (!prefix) return null;
  if (
    prefix.length > MAX_PREFIX_LENGTH ||
    prefix.split('/').some((part) => !part || part === '.' || part === '..') ||
    prefix.includes('\\') ||
    [...prefix].some((char) => char.charCodeAt(0) < 0x20)
  ) {
    errors.prefix = 'invalid_prefix';
  }
  return prefix;
}

export function validateRegion(value: unknown, errors: FieldErrors): string | null {
  const region = typeof value === 'string' ? value.trim() : '';
  if (!region) return null;
  if (!REGION_PATTERN.test(region)) errors.region = 'invalid_region';
  return region;
}

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata']);

function blockedIp(host: string): boolean {
  if (isIP(host) === 4) {
    const [a, b] = host.split('.').map(Number);
    return a === 127 || a === 0 || (a === 169 && b === 254);
  }
  if (isIP(host) === 6) {
    const lower = host.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith('::ffff:127.')
    );
  }
  return false;
}

/**
 * S3-compatible endpoint. Private networks are allowed (MinIO next to the server), but not the
 * loopback, link-local or cloud metadata addresses: the server makes requests to it.
 */
export function validateEndpoint(
  value: unknown,
  provider: StateProvider | null,
  errors: FieldErrors,
): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (provider !== 's3') {
    errors.endpoint = 'endpoint_s3_only';
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    errors.endpoint = 'invalid_endpoint';
    return null;
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    errors.endpoint = 'invalid_endpoint';
    return null;
  }
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || blockedIp(host)) {
    errors.endpoint = 'endpoint_not_allowed';
    return null;
  }
  return `${url.protocol}//${url.host}`;
}

export function validateAuth(value: unknown, errors: FieldErrors): StateAuthMode {
  if (value === undefined || value === null || value === '') return 'ambient';
  if (!STATE_AUTH_MODES.includes(value as StateAuthMode)) {
    errors.auth = 'invalid_auth';
    return 'ambient';
  }
  return value as StateAuthMode;
}

export type CredentialsInput = {
  serviceAccountJson?: unknown;
  accessKeyId?: unknown;
  secretAccessKey?: unknown;
  sessionToken?: unknown;
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Whether the input carries any credential value (an empty form keeps the stored ones). */
export function hasCredentialsInput(input: CredentialsInput | null | undefined): boolean {
  if (!input || typeof input !== 'object') return false;
  return [
    input.serviceAccountJson,
    input.accessKeyId,
    input.secretAccessKey,
    input.sessionToken,
  ].some((value) => text(value) !== '');
}

export function validateCredentials(
  provider: StateProvider,
  input: CredentialsInput,
  errors: FieldErrors,
): StateBackendCredentials | null {
  if (provider === 'gcs') {
    const raw = text(input.serviceAccountJson);
    if (!raw) {
      errors.credentials = 'required';
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (
        parsed?.type !== 'service_account' ||
        typeof parsed.client_email !== 'string' ||
        typeof parsed.private_key !== 'string'
      ) {
        errors.credentials = 'invalid_service_account';
        return null;
      }
    } catch {
      errors.credentials = 'invalid_service_account';
      return null;
    }
    return { provider: 'gcs', serviceAccountJson: raw };
  }
  const accessKeyId = text(input.accessKeyId);
  const secretAccessKey = text(input.secretAccessKey);
  if (!accessKeyId || !secretAccessKey) {
    errors.credentials = 'access_key_required';
    return null;
  }
  const sessionToken = text(input.sessionToken);
  return {
    provider: 's3',
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

export function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === 'on';
}
