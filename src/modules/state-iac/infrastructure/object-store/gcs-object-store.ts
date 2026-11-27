import { Readable } from 'node:stream';
import { Storage, type Bucket } from '@google-cloud/storage';
import {
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

/** HTTP status of a storage-client (`code`) or gaxios (`status`, `response.status`) error. */
const statusOf = (error: unknown) => {
  const e = (error ?? {}) as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const status = e.status ?? e.response?.status ?? e.code;
  return typeof status === 'number' ? status : Number(status) || undefined;
};
const isNotFound = (error: unknown) => statusOf(error) === 404;

/** The authenticated request of the storage client (gaxios); a seam for tests. */
export type GcsMediaRequest = (options: {
  url: string;
  params: Record<string, string>;
  responseType: 'stream';
}) => Promise<{ data: unknown }>;

export type GcsObjectStoreDeps = {
  request?: GcsMediaRequest;
  /** Default: the storage client's `apiEndpoint`. */
  apiEndpoint?: string;
};

/**
 * Google Cloud Storage. Needs `storage.objects.list` and `storage.objects.get` only
 * (`roles/storage.objectViewer`): it never writes.
 */
export class GcsObjectStore implements ObjectStore {
  private readonly bucket: Bucket;
  private readonly request: GcsMediaRequest;
  private readonly apiEndpoint: string;
  private readonly bucketName: string;

  constructor(config: GcsObjectStoreConfig, deps: GcsObjectStoreDeps = {}) {
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
    const storage = new Storage(options);
    this.bucket = storage.bucket(config.bucket);
    this.bucketName = config.bucket;
    // Objects are downloaded with the storage client's own auth client instead of
    // `file.createReadStream()`: that one (retry-request + teeny-request) piles up listeners on
    // the response stream and warns `MaxListenersExceededWarning` when many objects are read.
    this.request =
      deps.request ??
      ((request) => storage.authClient.request(request) as Promise<{ data: unknown }>);
    this.apiEndpoint = (deps.apiEndpoint ?? storage.apiEndpoint).replace(/\/+$/, '');
  }

  private async download(key: string, generation?: string): Promise<Readable | null> {
    try {
      const response = await this.request({
        url: `${this.apiEndpoint}/storage/v1/b/${encodeURIComponent(this.bucketName)}/o/${encodeURIComponent(key)}`,
        params: { alt: 'media', ...(generation ? { generation } : {}) },
        responseType: 'stream',
      });
      const body = response.data;
      // gaxios hands over a Node stream; tolerate a web stream too
      return body instanceof Readable
        ? body
        : Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
    } catch (error) {
      if (isNotFound(error)) return null;
      // keep the HTTP status where `classifyStoreError` reads it
      if (error && typeof error === 'object' && statusOf(error) !== undefined) {
        Object.assign(error, { code: statusOf(error) });
      }
      throw error;
    }
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
    return this.download(key);
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
    return this.download(key, versionId);
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
