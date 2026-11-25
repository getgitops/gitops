import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

/**
 * Read-only access to a bucket. Knows nothing about IaC: engines interpret the keys. Every key
 * is absolute in the bucket (prefixes are the engine's business).
 */
export interface ObjectStore {
  /**
   * One page of objects under `prefix`. With `delimiter: '/'`, keys deeper than one level are
   * folded into `prefixes` (the "folders"), like GCS and S3 do.
   */
  list(prefix: string, options?: ListOptions): Promise<ListPage>;
  /** Object metadata, or `null` when it does not exist. */
  head(key: string): Promise<ObjectInfo | null>;
  /** Raw object stream, or `null` when it does not exist. */
  openRead(key: string): Promise<Readable | null>;
}

export type ListOptions = { delimiter?: '/'; pageToken?: string; maxKeys?: number };

export type ObjectInfo = {
  key: string;
  size: number;
  updatedAt: string | null;
  /** ETag (S3) or generation (GCS): changes whenever the content does. */
  version: string | null;
};

export type ListPage = { objects: ObjectInfo[]; prefixes: string[]; nextPageToken: string | null };

/** Default limit of a decompressed object (ADR 0003): bigger ones fail, also against gzip bombs. */
export const DEFAULT_MAX_OBJECT_BYTES = 50 * 1024 * 1024;

export class ObjectTooLargeError extends Error {
  constructor(
    readonly key: string,
    readonly limit: number,
  ) {
    super(`Object ${key} is larger than ${limit} bytes`);
    this.name = 'ObjectTooLargeError';
  }
}

/** Every object under `prefix`, following pages (bounded by `maxObjects`). */
export async function listAll(
  store: ObjectStore,
  prefix: string,
  options: { delimiter?: '/'; maxObjects?: number } = {},
): Promise<{ objects: ObjectInfo[]; prefixes: string[]; truncated: boolean }> {
  const maxObjects = options.maxObjects ?? 10_000;
  const objects: ObjectInfo[] = [];
  const prefixes = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await store.list(prefix, { delimiter: options.delimiter, pageToken });
    objects.push(...page.objects);
    page.prefixes.forEach((p) => prefixes.add(p));
    pageToken = page.nextPageToken ?? undefined;
    if (objects.length >= maxObjects) {
      return { objects: objects.slice(0, maxObjects), prefixes: [...prefixes], truncated: true };
    }
  } while (pageToken);
  return { objects, prefixes: [...prefixes], truncated: false };
}

const GZIP_MAGIC = [0x1f, 0x8b];

/**
 * Reads a whole object, gunzipping it when its content is gzip (Pulumi detects compression by
 * content, not by name). Stops as soon as the raw or decompressed size passes `maxBytes`.
 * `null` when the object does not exist.
 */
export async function readObject(
  store: ObjectStore,
  key: string,
  maxBytes = DEFAULT_MAX_OBJECT_BYTES,
): Promise<Buffer | null> {
  const stream = await store.openRead(key);
  if (!stream) return null;

  const iterator = stream[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) return Buffer.alloc(0);
  const head = Buffer.from(first.value as Uint8Array);
  const rest = Readable.from(
    (async function* () {
      yield head;
      for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
        yield next.value;
      }
    })(),
  );
  const gzipped = head[0] === GZIP_MAGIC[0] && head[1] === GZIP_MAGIC[1];
  const source = gzipped ? rest.pipe(createGunzip()) : rest;

  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of source) {
      total += (chunk as Buffer).length;
      if (total > maxBytes) throw new ObjectTooLargeError(key, maxBytes);
      chunks.push(chunk as Buffer);
    }
  } finally {
    stream.destroy();
  }
  return Buffer.concat(chunks);
}

/** `readObject` + UTF-8 text. */
export async function readText(
  store: ObjectStore,
  key: string,
  maxBytes?: number,
): Promise<string | null> {
  const buffer = await readObject(store, key, maxBytes);
  return buffer ? buffer.toString('utf8') : null;
}

/**
 * Waits for the first chunk (or the first error) of `stream`, so a missing object fails at open
 * time instead of in the middle of a read. Returns an equivalent stream.
 */
export async function primeStream(stream: Readable): Promise<Readable> {
  const iterator = stream[Symbol.asyncIterator]();
  const first = await iterator.next();
  return Readable.from(
    (async function* () {
      if (first.done) return;
      yield first.value;
      for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
        yield next.value;
      }
    })(),
  );
}

/** Why a bucket read failed, as a short code stored in `lastError` and shown translated. */
export type StoreErrorCode =
  | 'access_denied'
  | 'bucket_not_found'
  | 'invalid_credentials'
  | 'network'
  | 'too_large'
  | 'unknown';

export function classifyStoreError(error: unknown): StoreErrorCode {
  if (error instanceof ObjectTooLargeError) return 'too_large';
  const e = (error ?? {}) as {
    name?: string;
    code?: string | number;
    Code?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const status = e.$metadata?.httpStatusCode ?? (typeof e.code === 'number' ? e.code : undefined);
  const name = String(e.Code ?? e.name ?? e.code ?? '');
  const message = String(e.message ?? '');
  if (/NoSuchBucket/i.test(name) || /bucket does not exist|NoSuchBucket/i.test(message)) {
    return 'bucket_not_found';
  }
  if (
    /InvalidAccessKeyId|SignatureDoesNotMatch|ExpiredToken|CredentialsProviderError|invalid_grant/i.test(
      name + ' ' + message,
    ) ||
    status === 401
  ) {
    return 'invalid_credentials';
  }
  if (status === 403 || /AccessDenied|Forbidden/i.test(name)) return 'access_denied';
  if (status === 404) return 'bucket_not_found';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|TimeoutError/i.test(name + message)) {
    return 'network';
  }
  return 'unknown';
}
