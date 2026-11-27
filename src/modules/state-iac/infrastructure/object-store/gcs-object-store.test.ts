import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { GcsObjectStore, type GcsMediaRequest } from './gcs-object-store';
import { classifyStoreError, readText } from './object-store';

async function collect(stream: Readable | null): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function storeWith(request: GcsMediaRequest) {
  return new GcsObjectStore(
    { bucket: 'my-bucket' },
    { request, apiEndpoint: 'https://storage.test/' },
  );
}

describe('GcsObjectStore media reads', () => {
  it('downloads the object through the auth client and returns its bytes', async () => {
    const calls: Parameters<GcsMediaRequest>[0][] = [];
    const store = storeWith(async (options) => {
      calls.push(options);
      return { data: Readable.from([Buffer.from('{"a":'), Buffer.from('1}')]) };
    });
    expect(await readText(store, '.pulumi/stacks/p/dev.json', 1024)).toBe('{"a":1}');
    expect(calls).toEqual([
      {
        url: 'https://storage.test/storage/v1/b/my-bucket/o/.pulumi%2Fstacks%2Fp%2Fdev.json',
        params: { alt: 'media' },
        responseType: 'stream',
      },
    ]);
  });

  it('accepts a web stream too', async () => {
    const store = storeWith(async () => ({
      data: new Blob(['hello']).stream(),
    }));
    expect(await readText(store, 'k', 1024)).toBe('hello');
  });

  it('a 404 is a missing object', async () => {
    const store = storeWith(async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    });
    expect(await store.openRead('k')).toBeNull();
    expect(await store.openReadVersion('k', '1')).toBeNull();
  });

  it('a 403 keeps its status and is classified as access_denied', async () => {
    const store = storeWith(async () => {
      throw Object.assign(new Error('forbidden'), { code: '403', response: { status: 403 } });
    });
    const error = await store.openRead('k').catch((e: unknown) => e);
    expect(classifyStoreError(error)).toBe('access_denied');
  });

  it('a version is read by generation', async () => {
    const calls: Parameters<GcsMediaRequest>[0][] = [];
    const store = storeWith(async (options) => {
      calls.push(options);
      return { data: Readable.from([Buffer.from('old')]) };
    });
    expect(await collect(await store.openReadVersion('k', '1795602803296701'))).toBe('old');
    expect(calls[0].params).toEqual({ alt: 'media', generation: '1795602803296701' });
  });
});
