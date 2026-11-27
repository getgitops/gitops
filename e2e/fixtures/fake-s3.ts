import { createServer, type Server } from 'node:http';
import { InMemoryObjectStore } from '../../src/modules/state-iac/infrastructure/object-store/in-memory-object-store';

/**
 * A read-only, path-style S3 endpoint over a local folder: enough of ListObjectsV2, GetObject and
 * HeadObject for the AWS SDK used by `S3ObjectStore`. The e2e dev server reads the State IaC
 * fixtures through it, so the whole read path (SDK, streaming, gunzip) is exercised. Requests are
 * not authenticated.
 */
export const FAKE_S3_BUCKET = 'e2e-state';

const xml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function notFound(code: 'NoSuchKey' | 'NoSuchBucket') {
  return `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`;
}

export function startFakeS3(directory: string, port: number): Promise<Server> {
  const store = InMemoryObjectStore.fromDirectory(directory);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://localhost:${port}`);
      const [, bucket, ...rest] = url.pathname.split('/');
      const key = decodeURIComponent(rest.join('/'));
      if (decodeURIComponent(bucket ?? '') !== FAKE_S3_BUCKET) {
        response
          .writeHead(404, { 'content-type': 'application/xml' })
          .end(notFound('NoSuchBucket'));
        return;
      }

      if (!key && request.method === 'GET') {
        const prefix = url.searchParams.get('prefix') ?? '';
        const delimiter = url.searchParams.get('delimiter') === '/' ? '/' : undefined;
        const maxKeys = Number(url.searchParams.get('max-keys') ?? 1000) || 1000;
        const token = url.searchParams.get('continuation-token') ?? undefined;
        const page = await store.list(prefix, { delimiter, maxKeys, pageToken: token });
        const body = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
          `<Name>${FAKE_S3_BUCKET}</Name><Prefix>${xml(prefix)}</Prefix>`,
          `<KeyCount>${page.objects.length + page.prefixes.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys>`,
          delimiter ? `<Delimiter>${delimiter}</Delimiter>` : '',
          `<IsTruncated>${page.nextPageToken ? 'true' : 'false'}</IsTruncated>`,
          page.nextPageToken
            ? `<NextContinuationToken>${xml(page.nextPageToken)}</NextContinuationToken>`
            : '',
          ...page.objects.map(
            (object) =>
              `<Contents><Key>${xml(object.key)}</Key><LastModified>${object.updatedAt}</LastModified><ETag>&quot;${object.version}&quot;</ETag><Size>${object.size}</Size><StorageClass>STANDARD</StorageClass></Contents>`,
          ),
          ...page.prefixes.map(
            (p) => `<CommonPrefixes><Prefix>${xml(p)}</Prefix></CommonPrefixes>`,
          ),
          '</ListBucketResult>',
        ].join('');
        response.writeHead(200, { 'content-type': 'application/xml' }).end(body);
        return;
      }

      const info = await store.head(key);
      if (!info) {
        response
          .writeHead(404, { 'content-type': 'application/xml' })
          .end(request.method === 'HEAD' ? undefined : notFound('NoSuchKey'));
        return;
      }
      const headers = {
        'content-length': String(info.size),
        etag: `"${info.version}"`,
        'last-modified': new Date(info.updatedAt ?? Date.now()).toUTCString(),
        'content-type': 'application/octet-stream',
      };
      if (request.method === 'HEAD') {
        response.writeHead(200, headers).end();
        return;
      }
      // raw bytes (gzip included): the client decompresses
      const body = await readRaw(store, key);
      response.writeHead(200, headers).end(body);
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

async function readRaw(store: InMemoryObjectStore, key: string): Promise<Buffer> {
  const stream = await store.openRead(key);
  if (!stream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
