import type { DatabaseClient } from '$lib/database/types';
import type { StorageBackend, StorageProvider } from '../../domain/entities';
import type { StorageBackendRepository } from '../../domain/repositories';

type StorageBackendRow = {
  id: string;
  name: string;
  provider: string;
  bucket: string;
  region?: string | null;
  access_key_id?: string | null;
  secret_access_key?: string | null;
  endpoint?: string | null;
  gcp_project_id?: string | null;
  gcp_credentials?: string | null;
};

export class SqliteStorageBackendRepository implements StorageBackendRepository {
  constructor(private readonly db: DatabaseClient) {}

  list(): StorageBackend[] {
    const rows = this.db.all<StorageBackendRow>('SELECT * FROM storage_backends ORDER BY created_at DESC');
    return rows.map((row) => this.toEntity(row));
  }

  findById(id: string): StorageBackend | null {
    const row = this.db.get<StorageBackendRow>('SELECT * FROM storage_backends WHERE id = ?', [id]);
    return row ? this.toEntity(row) : null;
  }

  upsert(backend: StorageBackend): string {
    this.db.run(
      `
      INSERT INTO storage_backends (
        id, name, provider, bucket, region, access_key_id, secret_access_key, endpoint, gcp_project_id, gcp_credentials
      ) VALUES (
        @id, @name, @provider, @bucket, @region, @accessKeyId, @secretAccessKey, @endpoint, @gcpProjectId, @gcpCredentials
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        provider = excluded.provider,
        bucket = excluded.bucket,
        region = excluded.region,
        access_key_id = excluded.access_key_id,
        secret_access_key = excluded.secret_access_key,
        endpoint = excluded.endpoint,
        gcp_project_id = excluded.gcp_project_id,
        gcp_credentials = excluded.gcp_credentials
    `,
      {
        id: backend.id,
        name: backend.name,
        provider: backend.provider,
        bucket: backend.bucket,
        region: backend.region || null,
        accessKeyId: backend.accessKeyId || null,
        secretAccessKey: backend.secretAccessKey || null,
        endpoint: backend.endpoint || null,
        gcpProjectId: backend.gcpProjectId || null,
        gcpCredentials: backend.gcpCredentials || null,
      },
    );

    return backend.id;
  }

  deleteById(id: string): void {
    this.db.run('DELETE FROM storage_backends WHERE id = ?', [id]);
  }

  private toEntity(row: StorageBackendRow): StorageBackend {
    return {
      id: row.id,
      name: row.name,
      provider: this.normalizeProvider(row.provider),
      bucket: row.bucket,
      region: row.region,
      accessKeyId: row.access_key_id,
      secretAccessKey: row.secret_access_key,
      endpoint: row.endpoint,
      gcpProjectId: row.gcp_project_id,
      gcpCredentials: row.gcp_credentials,
    };
  }

  private normalizeProvider(provider: string): StorageProvider {
    return provider === 'gcs' ? 'gcs' : 's3';
  }
}
