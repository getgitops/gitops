export interface StorageConfig {
  provider: 's3' | 'gcs';
  bucket: string;
  region?: string | null;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
  endpoint?: string | null;
  gcpProjectId?: string | null;
  gcpCredentials?: string | null;
}
