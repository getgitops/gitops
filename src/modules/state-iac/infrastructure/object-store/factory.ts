import type {
  StateBackendCredentials,
  StateBackendDomain,
} from '../../domain/state-backend.domain';
import { GcsObjectStore } from './gcs-object-store';
import type { ObjectStore } from './object-store';
import { S3ObjectStore } from './s3-object-store';

/** Builds the store of a backend; `credentials` is `null` for ambient auth. */
export type ObjectStoreFactory = (
  backend: StateBackendDomain,
  credentials: StateBackendCredentials | null,
) => ObjectStore;

export const createObjectStore: ObjectStoreFactory = (backend, credentials) => {
  if (backend.provider === 'gcs') {
    return new GcsObjectStore({
      bucket: backend.bucket,
      serviceAccountJson: credentials?.provider === 'gcs' ? credentials.serviceAccountJson : null,
    });
  }
  return new S3ObjectStore({
    bucket: backend.bucket,
    region: backend.region,
    endpoint: backend.endpoint,
    forcePathStyle: backend.forcePathStyle,
    credentials:
      credentials?.provider === 's3'
        ? {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken || undefined,
          }
        : null,
  });
};
