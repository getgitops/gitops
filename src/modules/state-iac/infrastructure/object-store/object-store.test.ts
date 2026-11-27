import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { InMemoryObjectStore } from './in-memory-object-store';
import {
  ObjectTooLargeError,
  classifyStoreError,
  listAll,
  readObject,
  readText,
} from './object-store';

describe('InMemoryObjectStore listing', () => {
  const store = new InMemoryObjectStore(2);
  for (const key of [
    '.pulumi/meta.yaml',
    '.pulumi/stacks/a/dev.json',
    '.pulumi/stacks/a/prod.json',
    '.pulumi/stacks/b/dev.json',
    '.pulumi/stacks/top.json',
  ]) {
    store.put(key, '{}');
  }

  it('folds deeper keys into prefixes with a delimiter', async () => {
    const all = await listAll(store, '.pulumi/stacks/', { delimiter: '/' });
    expect(all.prefixes).toEqual(['.pulumi/stacks/a/', '.pulumi/stacks/b/']);
    expect(all.objects.map((o) => o.key)).toEqual(['.pulumi/stacks/top.json']);
  });

  it('pages through every key', async () => {
    const first = await store.list('.pulumi/');
    expect(first.objects).toHaveLength(2);
    expect(first.nextPageToken).not.toBeNull();
    const all = await listAll(store, '.pulumi/');
    expect(all.objects).toHaveLength(5);
    expect(all.truncated).toBe(false);
  });

  it('stops at maxObjects', async () => {
    const all = await listAll(store, '.pulumi/', { maxObjects: 3 });
    expect(all.objects).toHaveLength(3);
    expect(all.truncated).toBe(true);
  });
});

describe('readObject', () => {
  it('returns null for a missing object', async () => {
    expect(await readObject(new InMemoryObjectStore(), 'nope')).toBeNull();
  });

  it('detects gzip by content, not by name', async () => {
    const store = new InMemoryObjectStore();
    const body = JSON.stringify({ version: 3, big: 'x'.repeat(100_000) });
    store.put('stack.json', gzipSync(body));
    store.put('plain.json.gz', body);
    expect(await readText(store, 'stack.json')).toBe(body);
    expect(await readText(store, 'plain.json.gz')).toBe(body);
  });

  it('stops past the size limit, also when decompressing (gzip bomb)', async () => {
    const store = new InMemoryObjectStore();
    store.put('big.json', 'x'.repeat(2_000));
    store.put('bomb.json.gz', gzipSync(Buffer.alloc(5_000_000)));
    await expect(readObject(store, 'big.json', 1_000)).rejects.toBeInstanceOf(ObjectTooLargeError);
    await expect(readObject(store, 'bomb.json.gz', 100_000)).rejects.toBeInstanceOf(
      ObjectTooLargeError,
    );
  });
});

describe('classifyStoreError', () => {
  it('maps provider errors to short codes', () => {
    expect(classifyStoreError({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })).toBe(
      'access_denied',
    );
    expect(
      classifyStoreError({ code: 403, message: 'x@y.iam does not have storage.objects.list' }),
    ).toBe('access_denied');
    expect(classifyStoreError({ name: 'NoSuchBucket' })).toBe('bucket_not_found');
    expect(classifyStoreError({ code: 404, message: 'The specified bucket does not exist.' })).toBe(
      'bucket_not_found',
    );
    expect(classifyStoreError({ name: 'InvalidAccessKeyId' })).toBe('invalid_credentials');
    expect(classifyStoreError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' })).toBe(
      'network',
    );
    expect(classifyStoreError(new ObjectTooLargeError('k', 1))).toBe('too_large');
    expect(classifyStoreError(new Error('boom'))).toBe('unknown');
  });
});
