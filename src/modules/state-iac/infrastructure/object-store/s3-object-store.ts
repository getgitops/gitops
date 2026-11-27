import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import type { ListOptions, ListPage, ObjectInfo, ObjectStore, ObjectVersion } from './object-store';

export type S3ObjectStoreConfig = {
  bucket: string;
  region?: string | null;
  /** S3-compatible endpoint (MinIO, Cloudflare R2…). */
  endpoint?: string | null;
  forcePathStyle?: boolean;
  /** Without them, the default AWS credential chain (IAM role, env, profile). */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string } | null;
};

const isNotFound = (error: unknown) => {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
};

/**
 * AWS S3 and S3-compatible stores. Needs `s3:ListBucket` and `s3:GetObject` only: it never writes.
 */
export class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3ObjectStoreConfig) {
    const options: S3ClientConfig = {
      // the SDK requires a region; S3-compatible stores usually ignore it
      region: config.region || 'us-east-1',
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle ?? false,
    };
    if (config.credentials) options.credentials = { ...config.credentials };
    this.client = new S3Client(options);
    this.bucket = config.bucket;
  }

  async list(prefix: string, options: ListOptions = {}): Promise<ListPage> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        Delimiter: options.delimiter,
        ContinuationToken: options.pageToken,
        MaxKeys: options.maxKeys ?? 1000,
      }),
    );
    return {
      objects: (response.Contents ?? []).map((item) => ({
        key: item.Key ?? '',
        size: item.Size ?? 0,
        updatedAt: item.LastModified?.toISOString() ?? null,
        version: item.ETag ?? null,
      })),
      prefixes: (response.CommonPrefixes ?? []).flatMap((p) => (p.Prefix ? [p.Prefix] : [])),
      nextPageToken: response.IsTruncated ? (response.NextContinuationToken ?? null) : null,
    };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        key,
        size: response.ContentLength ?? 0,
        updatedAt: response.LastModified?.toISOString() ?? null,
        version: response.ETag ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** Needs `s3:ListBucketVersions`; empty without versioning or permission. */
  async listVersions(key: string): Promise<ObjectVersion[]> {
    try {
      const versions: ObjectVersion[] = [];
      let keyMarker: string | undefined;
      let versionIdMarker: string | undefined;
      do {
        const response = await this.client.send(
          new ListObjectVersionsCommand({
            Bucket: this.bucket,
            Prefix: key,
            KeyMarker: keyMarker,
            VersionIdMarker: versionIdMarker,
          }),
        );
        for (const version of response.Versions ?? []) {
          // unversioned objects report the version id "null"
          if (version.Key !== key || !version.VersionId || version.VersionId === 'null') continue;
          versions.push({
            versionId: version.VersionId,
            updatedAt: version.LastModified?.toISOString() ?? null,
            size: version.Size ?? 0,
            latest: version.IsLatest === true,
          });
        }
        keyMarker = response.IsTruncated ? response.NextKeyMarker : undefined;
        versionIdMarker = response.IsTruncated ? response.NextVersionIdMarker : undefined;
      } while (keyMarker && versions.length < 5_000);
      return versions.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    } catch {
      return [];
    }
  }

  openReadVersion(key: string, versionId: string): Promise<Readable | null> {
    return this.get(key, versionId);
  }

  openRead(key: string): Promise<Readable | null> {
    return this.get(key);
  }

  /** Needs `s3:GetObject` (and `s3:GetObjectVersion` with a version). */
  private async get(key: string, versionId?: string): Promise<Readable | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, VersionId: versionId }),
      );
      const body = response.Body;
      if (!body) return Readable.from([]);
      return body instanceof Readable
        ? body
        : Readable.fromWeb(
            (body as { transformToWebStream(): ReadableStream }).transformToWebStream() as never,
          );
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
}
