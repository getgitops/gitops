import type { Readable } from 'node:stream';
import { Storage, type Bucket } from '@google-cloud/storage';
import {
  primeStream,
  type ListOptions,
  type ListPage,
  type ObjectInfo,
  type ObjectStore,
  type ObjectVersion,
} from './object-store';

export type GcsObjectStoreConfig = {
  bucket: string;
  /** Service account key JSON; without it, Application Default Credentials (Workload Identity). */
  serviceAccountJson?: string | null;
};

const isNotFound = (error: unknown) => (error as { code?: number })?.code === 404;

/**
 * Google Cloud Storage. Needs `storage.objects.list` and `storage.objects.get` only
 * (`roles/storage.objectViewer`): it never writes.
 */
export class GcsObjectStore implements ObjectStore {
  private readonly bucket: Bucket;

  constructor(config: GcsObjectStoreConfig) {
    const options: ConstructorParameters<typeof Storage>[0] = {};
    if (config.serviceAccountJson) {
      const credentials = JSON.parse(config.serviceAccountJson) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      options.credentials = credentials;
      if (credentials.project_id) options.projectId = credentials.project_id;
    }
    this.bucket = new Storage(options).bucket(config.bucket);
  }

  async list(prefix: string, options: ListOptions = {}): Promise<ListPage> {
    const [files, , response] = await this.bucket.getFiles({
      prefix,
      delimiter: options.delimiter,
      pageToken: options.pageToken,
      maxResults: options.maxKeys ?? 1000,
      autoPaginate: false,
    });
    const body = (response ?? {}) as { prefixes?: string[]; nextPageToken?: string };
    return {
      objects: files.map((file) => toInfo(file.name, file.metadata)),
      prefixes: body.prefixes ?? [],
      nextPageToken: body.nextPageToken ?? null,
    };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const [metadata] = await this.bucket.file(key).getMetadata();
      return toInfo(key, metadata);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async openRead(key: string): Promise<Readable | null> {
    try {
      return await primeStream(this.bucket.file(key).createReadStream());
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** `storage.objects.list` with `versions=true` (Object Versioning): no extra permission. */
  async listVersions(key: string): Promise<ObjectVersion[]> {
    try {
      const [files] = await this.bucket.getFiles({ prefix: key, versions: true });
      return files
        .filter((file) => file.name === key && file.metadata.generation !== undefined)
        .map((file) => ({
          versionId: String(file.metadata.generation),
          updatedAt: (file.metadata.updated as string | undefined) ?? null,
          size: Number(file.metadata.size ?? 0),
          // noncurrent versions carry the time they stopped being live
          latest: !file.metadata.timeDeleted,
        }))
        .sort((a, b) => (BigInt(b.versionId) > BigInt(a.versionId) ? 1 : -1));
    } catch {
      // no versioning or no permission: the diff falls back to the other sources
      return [];
    }
  }

  async openReadVersion(key: string, versionId: string): Promise<Readable | null> {
    try {
      return await primeStream(
        this.bucket.file(key, { generation: Number(versionId) }).createReadStream(),
      );
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
}

function toInfo(
  key: string,
  metadata: { size?: string | number; updated?: string; generation?: string | number } = {},
): ObjectInfo {
  return {
    key,
    size: Number(metadata.size ?? 0),
    updatedAt: metadata.updated ?? null,
    version: metadata.generation !== undefined ? String(metadata.generation) : null,
  };
}
