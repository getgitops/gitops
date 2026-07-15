import { db } from './db';

export interface InstanceConfig {
  publicAccess: boolean;
  googleSsoEnabled: boolean;
  googleClientId?: string | null;
  googleClientSecret?: string | null;
}

export interface StorageBackend {
  id: string;
  name: string;
  provider: 's3' | 'gcs';
  bucket: string;
  region?: string | null;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
  endpoint?: string | null;
  gcpProjectId?: string | null;
  gcpCredentials?: string | null;
}

const DEFAULT_CONFIG: InstanceConfig = {
  publicAccess: false,
  googleSsoEnabled: false,
};

type ConfigRow = {
  public_access?: number | null;
  google_sso_enabled?: number | null;
  google_client_id?: string | null;
  google_client_secret?: string | null;
};

type StorageBackendRow = {
  id: string;
  name: string;
  provider: 's3' | 'gcs';
  bucket: string;
  region?: string | null;
  access_key_id?: string | null;
  secret_access_key?: string | null;
  endpoint?: string | null;
  gcp_project_id?: string | null;
  gcp_credentials?: string | null;
};

export async function getConfig(): Promise<InstanceConfig | null> {
  try {
    const row = db.prepare('SELECT * FROM config WHERE id = 1').get() as ConfigRow | undefined;
    if (!row) return null;

    const pub = row.public_access !== undefined ? row.public_access === 1 : true;

    return {
      publicAccess: pub,
      googleSsoEnabled: row.google_sso_enabled === 1,
      googleClientId: row.google_client_id,
      googleClientSecret: row.google_client_secret,
    } as InstanceConfig;
  } catch (error) {
    console.error('Error reading config from SQLite:', error);
    return null;
  }
}

export async function saveConfig(config: Partial<InstanceConfig>) {
  const existing = (await getConfig()) || DEFAULT_CONFIG;
  const merged = { ...existing, ...config };

  db.prepare(
    `
    INSERT INTO config (
      id, updated_at, public_access, google_sso_enabled,
      google_client_id, google_client_secret
    )
    VALUES (
      1, CURRENT_TIMESTAMP, @publicAccess, @googleSsoEnabled,
      @googleClientId, @googleClientSecret
    )
    ON CONFLICT(id) DO UPDATE SET
      public_access = excluded.public_access,
      google_sso_enabled = excluded.google_sso_enabled,
      google_client_id = excluded.google_client_id,
      google_client_secret = excluded.google_client_secret,
      updated_at = CURRENT_TIMESTAMP
  `,
  ).run({
    publicAccess: merged.publicAccess ? 1 : 0,
    googleSsoEnabled: merged.googleSsoEnabled ? 1 : 0,
    googleClientId: merged.googleClientId || null,
    googleClientSecret: merged.googleClientSecret || null,
  });
}

export function getStorageBackends(): StorageBackend[] {
  const rows = db
    .prepare('SELECT * FROM storage_backends ORDER BY created_at DESC')
    .all() as StorageBackendRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    provider: row.provider,
    bucket: row.bucket,
    region: row.region,
    accessKeyId: row.access_key_id,
    secretAccessKey: row.secret_access_key ? '***' : null,
    endpoint: row.endpoint,
    gcpProjectId: row.gcp_project_id,
    gcpCredentials: row.gcp_credentials ? '***' : null,
  }));
}

export function getStorageBackend(id: string): StorageBackend | null {
  const row = db.prepare('SELECT * FROM storage_backends WHERE id = ?').get(id) as
    StorageBackendRow | undefined;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    bucket: row.bucket,
    region: row.region,
    accessKeyId: row.access_key_id,
    secretAccessKey: row.secret_access_key,
    endpoint: row.endpoint,
    gcpProjectId: row.gcp_project_id,
    gcpCredentials: row.gcp_credentials,
  };
}
