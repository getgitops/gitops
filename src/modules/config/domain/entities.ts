export interface InstanceConfig {
  publicAccess: boolean;
  googleSsoEnabled: boolean;
  googleClientId?: string | null;
  googleClientSecret?: string | null;
  samlEnabled: boolean;
  samlEntryPoint?: string | null;
  samlIssuer?: string | null;
  samlCert?: string | null;
}

export type StorageProvider = 's3' | 'gcs';

export interface StorageBackend {
  id: string;
  name: string;
  provider: StorageProvider;
  bucket: string;
  region?: string | null;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
  endpoint?: string | null;
  gcpProjectId?: string | null;
  gcpCredentials?: string | null;
}

export interface StorageBackendPublic {
  id: string;
  name: string;
  provider: StorageProvider;
  bucket: string;
  region?: string | null;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
  endpoint?: string | null;
  gcpProjectId?: string | null;
  gcpCredentials?: string | null;
}

export interface UpsertStorageBackendInput {
  id?: string;
  name?: string;
  provider: StorageProvider;
  bucket: string;
  region?: string | null;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
  endpoint?: string | null;
  gcpProjectId?: string | null;
  gcpCredentials?: string | null;
}
