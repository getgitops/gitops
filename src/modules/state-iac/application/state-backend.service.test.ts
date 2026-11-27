import { beforeEach, describe, expect, it } from 'vitest';
import { StateIacValidationError } from '../domain/state-backend.domain';
import { createStateIacFixture, fixtureStore } from './testing';

const SERVICE_ACCOUNT = JSON.stringify({
  type: 'service_account',
  project_id: 'acme',
  client_email: 'state-reader@acme.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nsupersecretkey\n-----END PRIVATE KEY-----\n',
});

const gcsInput = (overrides: Record<string, unknown> = {}) => ({
  name: 'gcs-prod',
  provider: 'gcs',
  bucket: 'acme-pulumi-state',
  ...overrides,
});

async function validationErrors(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof StateIacValidationError) return error.errors;
    throw error;
  }
  throw new Error('expected a validation error');
}

describe('StateBackendService', () => {
  let fx: ReturnType<typeof createStateIacFixture>;
  beforeEach(() => {
    fx = createStateIacFixture();
  });

  describe('create', () => {
    it('creates an ambient-auth backend, normalizing bucket and prefix', async () => {
      const backend = await fx.backendService.create(
        'org-1',
        gcsInput({ bucket: 'gs://acme-pulumi-state/', prefix: '/infra/.pulumi/' }),
      );
      expect(backend.toView()).toMatchObject({
        organizationId: 'org-1',
        engine: 'pulumi',
        provider: 'gcs',
        bucket: 'acme-pulumi-state',
        prefix: 'infra',
        auth: 'ambient',
        hasCredentials: false,
        enabled: true,
      });
      expect(backend.pulumiRoot).toBe('infra/.pulumi/');
      expect(fx.events.ofType('state_iac.backend.created').map((e) => e.payload)).toEqual([
        {
          backendId: backend.id,
          name: 'gcs-prod',
          engine: 'pulumi',
          provider: 'gcs',
          bucket: 'acme-pulumi-state',
          prefix: 'infra',
        },
      ]);
    });

    it('stores credentials encrypted, bound to the backend, and never shows them', async () => {
      const backend = await fx.backendService.create(
        'org-1',
        gcsInput({ auth: 'credentials', credentials: { serviceAccountJson: SERVICE_ACCOUNT } }),
      );
      const stored = fx.backends.rows[0].credentials ?? '';
      expect(stored).not.toContain('supersecretkey');
      expect(JSON.parse(fx.cipher.decrypt(backend.id, stored))).toEqual({
        provider: 'gcs',
        serviceAccountJson: SERVICE_ACCOUNT,
      });
      const view = backend.toView();
      expect(view.hasCredentials).toBe(true);
      expect(JSON.stringify(view)).not.toContain('supersecretkey');
      expect('credentials' in view).toBe(false);
      // nor in the event
      expect(JSON.stringify(fx.events.events)).not.toContain('supersecretkey');
    });

    it('returns errors per field', async () => {
      expect(
        await validationErrors(
          fx.backendService.create('org-1', { provider: 'azure', bucket: 'Not A Bucket' }),
        ),
      ).toEqual({ name: 'required', provider: 'invalid_provider', bucket: 'invalid_bucket' });
      expect(
        await validationErrors(
          fx.backendService.create(
            'org-1',
            gcsInput({ prefix: 'a/../b', endpoint: 'https://minio' }),
          ),
        ),
      ).toEqual({ prefix: 'invalid_prefix', endpoint: 'endpoint_s3_only' });
    });

    it('requires valid credentials when auth is credentials', async () => {
      expect(
        await validationErrors(
          fx.backendService.create('org-1', gcsInput({ auth: 'credentials' })),
        ),
      ).toEqual({ credentials: 'required' });
      expect(
        await validationErrors(
          fx.backendService.create(
            'org-1',
            gcsInput({
              auth: 'credentials',
              credentials: { serviceAccountJson: '{"type":"user"}' },
            }),
          ),
        ),
      ).toEqual({ credentials: 'invalid_service_account' });
      expect(
        await validationErrors(
          fx.backendService.create('org-1', {
            name: 's3',
            provider: 's3',
            bucket: 'b-1',
            auth: 'credentials',
            credentials: { accessKeyId: 'AKIA' },
          }),
        ),
      ).toEqual({ credentials: 'access_key_required' });
    });

    it('rejects duplicate names in the organization, not across organizations', async () => {
      await fx.backendService.create('org-1', gcsInput());
      expect(
        await validationErrors(fx.backendService.create('org-1', gcsInput({ name: 'GCS-PROD' }))),
      ).toEqual({ name: 'duplicate_name' });
      await expect(fx.backendService.create('org-2', gcsInput())).resolves.toBeTruthy();
    });

    it('accepts S3-compatible endpoints but not loopback, link-local or metadata hosts', async () => {
      const s3 = (endpoint: string) => ({
        name: `s3-${Math.random()}`,
        provider: 's3',
        bucket: 'state',
        endpoint,
      });
      const minio = await fx.backendService.create('org-1', s3('http://10.0.0.5:9000/'));
      expect(minio.endpoint).toBe('http://10.0.0.5:9000');
      // an endpoint means path-style by default (MinIO)
      expect(minio.forcePathStyle).toBe(true);
      for (const endpoint of [
        'http://127.0.0.1:9000',
        'http://169.254.169.254',
        'http://localhost:9000',
        'http://metadata.google.internal',
        'http://[::1]:9000',
      ]) {
        expect(await validationErrors(fx.backendService.create('org-1', s3(endpoint)))).toEqual({
          endpoint: 'endpoint_not_allowed',
        });
      }
      for (const endpoint of ['ftp://minio', 'https://u:p@minio', 'https://minio/path', 'nope']) {
        expect(await validationErrors(fx.backendService.create('org-1', s3(endpoint)))).toEqual({
          endpoint: 'invalid_endpoint',
        });
      }
    });
  });

  describe('update', () => {
    it('keeps the stored credentials when none are typed, replaces them when they are', async () => {
      const backend = await fx.backendService.create('org-1', {
        name: 's3',
        provider: 's3',
        bucket: 'state',
        auth: 'credentials',
        credentials: { accessKeyId: 'AKIA1', secretAccessKey: 'secret-1' },
      });
      const before = fx.backends.rows[0].credentials;

      await fx.backendService.update(backend.id, { name: 's3-renamed', credentials: {} });
      expect(fx.backends.rows[0].credentials).toBe(before);

      await fx.backendService.update(backend.id, {
        credentials: { accessKeyId: 'AKIA2', secretAccessKey: 'secret-2' },
      });
      const after = fx.backends.rows[0].credentials ?? '';
      expect(after).not.toBe(before);
      expect(JSON.parse(fx.cipher.decrypt(backend.id, after)).accessKeyId).toBe('AKIA2');

      const updates = fx.events.ofType('state_iac.backend.updated').map((e) => e.payload);
      expect(updates.map((p) => p.changedFields)).toEqual([['name'], ['credentials']]);
      expect(JSON.stringify(updates)).not.toMatch(/secret-|AKIA/);
    });

    it('switching to ambient removes the credentials', async () => {
      const backend = await fx.backendService.create(
        'org-1',
        gcsInput({ auth: 'credentials', credentials: { serviceAccountJson: SERVICE_ACCOUNT } }),
      );
      const updated = await fx.backendService.update(backend.id, { auth: 'ambient' });
      expect(updated.credentials).toBeNull();
      expect(fx.backends.rows[0].credentials).toBeNull();
    });

    it('switching to credentials needs them', async () => {
      const backend = await fx.backendService.create('org-1', gcsInput());
      expect(
        await validationErrors(fx.backendService.update(backend.id, { auth: 'credentials' })),
      ).toEqual({ credentials: 'required' });
    });

    it('does not change the provider nor write when nothing changes', async () => {
      const backend = await fx.backendService.create('org-1', gcsInput());
      expect(
        await validationErrors(fx.backendService.update(backend.id, { provider: 's3' })),
      ).toEqual({ provider: 'provider_immutable' });
      await fx.backendService.update(backend.id, { name: 'gcs-prod', bucket: 'acme-pulumi-state' });
      expect(fx.events.ofType('state_iac.backend.updated')).toHaveLength(0);
    });

    it('clears the last error when the bucket changes', async () => {
      const backend = await fx.backendService.create('org-1', gcsInput());
      fx.backends.rows[0].lastError = 'access_denied';
      const updated = await fx.backendService.update(backend.id, { bucket: 'other-bucket' });
      expect(updated.lastError).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes the backend and its bindings, and only those', async () => {
      const a = await fx.backendService.create('org-1', gcsInput({ name: 'a' }));
      const b = await fx.backendService.create('org-1', gcsInput({ name: 'b' }));
      await fx.bindingService.set(a, 'network', { projectId: 'p1' });
      await fx.bindingService.set(b, 'payments', { projectId: 'p2' });

      await fx.backendService.delete(a.id);
      expect(fx.backends.rows.map((row) => row.id)).toEqual([b.id]);
      expect(fx.bindings.rows.map((row) => row.pulumiProject)).toEqual(['payments']);
      expect(fx.events.ofType('state_iac.backend.deleted')).toHaveLength(1);
    });
  });

  describe('test and discover (read-only)', () => {
    it('lists the bucket and reads meta.yaml', async () => {
      const backend = await fx.backendService.create('org-1', gcsInput({ prefix: 'infra' }));
      fx.buckets.set('acme-pulumi-state', fixtureStore('project-layout', 'infra'));
      expect(await fx.backendService.test(backend.id)).toEqual({
        ok: true,
        layout: 'project',
        metaVersion: 1,
        projects: 2,
        stacks: 3,
      });
      expect(fx.backends.rows[0].lastScanAt).not.toBeNull();
    });

    it('builds the store with the decrypted credentials, ambient with none', async () => {
      const ambient = await fx.backendService.create('org-1', gcsInput({ name: 'ambient' }));
      const keyed = await fx.backendService.create(
        'org-1',
        gcsInput({
          name: 'keyed',
          auth: 'credentials',
          credentials: { serviceAccountJson: SERVICE_ACCOUNT },
        }),
      );
      await fx.backendService.test(ambient.id);
      await fx.backendService.test(keyed.id);
      expect(fx.credentialsSeen).toEqual([
        null,
        { provider: 'gcs', serviceAccountJson: SERVICE_ACCOUNT },
      ]);
    });

    it('records a failure as a short code, once', async () => {
      const backend = await fx.backendService.create('org-1', gcsInput());
      const store = fixtureStore('project-layout');
      store.failWith = Object.assign(new Error('caller does not have storage.objects.list'), {
        code: 403,
      });
      fx.buckets.set('acme-pulumi-state', store);

      expect(await fx.backendService.test(backend.id)).toEqual({
        ok: false,
        error: 'access_denied',
      });
      expect(fx.backends.rows[0].lastError).toBe('access_denied');

      store.failWith = null;
      expect((await fx.backendService.discover(backend.id)).ok).toBe(true);
      expect(fx.backends.rows[0].lastError).toBeNull();
    });

    it('reports undecryptable credentials instead of throwing', async () => {
      const backend = await fx.backendService.create(
        'org-1',
        gcsInput({ auth: 'credentials', credentials: { serviceAccountJson: SERVICE_ACCOUNT } }),
      );
      fx.backends.rows[0].credentials = 'v1:broken:value:here';
      expect(await fx.backendService.test(backend.id)).toEqual({
        ok: false,
        error: 'undecryptable',
      });
    });

    it('never writes to the bucket', async () => {
      const backend = await fx.backendService.create('org-1', gcsInput());
      const store = fixtureStore('project-layout');
      fx.buckets.set('acme-pulumi-state', store);
      await fx.backendService.discover(backend.id);
      // the store has no write method at all; only reads were made
      expect(new Set(store.calls.map((call) => call.op))).toEqual(new Set(['get', 'list']));
    });
  });
});
