import { describe, expect, it } from 'vitest';
import { fixtureStore } from '../../../application/testing';
import type { EngineStack } from '../state-engine';
import { PulumiStateEngine } from './pulumi-state-engine';
import { normalizeValue, parseCheckpoint, UnsupportedStateVersionError } from './pulumi-state';

const engine = new PulumiStateEngine();
const MAX = 50 * 1024 * 1024;
// the fake ciphertexts of the fixtures all encode "fixture-ciphertext-<n>"
const FAKE_CIPHERTEXT = Buffer.from('fixture-ciphertext').toString('base64').slice(0, 20);

async function stacksOf(layout: 'project-layout' | 'legacy-layout') {
  const store = fixtureStore(layout);
  const discovery = await engine.discoverStacks(store, '.pulumi/', 'b1');
  const find = (project: string | null, stack: string) =>
    discovery.stacks.find((s) => s.ref.project === project && s.ref.stack === stack) as EngineStack;
  return { store, discovery, find };
}

describe('PulumiStateEngine on the real (anonymized) fixtures', () => {
  it('discovers stacks with their reference and object version', async () => {
    const { discovery } = await stacksOf('project-layout');
    expect(discovery.stacks.map((s) => `${s.ref.project}/${s.ref.stack}`)).toEqual([
      'acme-infra/prod',
      'acme-infra/staging',
      'acme-platform/dev',
    ]);
    expect(discovery.stacks[0].ref).toEqual({
      backendId: 'b1',
      engine: 'pulumi',
      project: 'acme-infra',
      stack: 'prod',
      layout: 'project',
    });
    expect(discovery.stacks[0].version).not.toBeNull();
  });

  it('reads a snapshot: resources, stack outputs and metadata', async () => {
    const { store, find } = await stacksOf('project-layout');
    const snapshot = await engine.readSnapshot(store, '.pulumi/', find('acme-infra', 'prod'), {
      maxBytes: MAX,
    });
    expect(snapshot.resources).toHaveLength(49);
    expect(snapshot.toolVersion).toBe('v3.276.0');
    expect(snapshot.takenAt).toBe('2026-11-25T11:56:55.792125+01:00');
    expect(snapshot.pendingOperations).toBe(0);
    expect(snapshot.outputs).toMatchObject({
      assetsBucketName: 'acme-assets-prod',
      redisPort: 6378,
    });

    const service = snapshot.resources.find((r) => r.name === 'enable-apis-dns')!;
    expect(service).toMatchObject({
      type: 'gcp:projects/service:Service',
      providerType: 'gcp',
      managed: true,
      parent: 'urn:pulumi:prod::acme-infra::acme:infra:enable-apis::enable-apis',
    });
    // provider reference without its trailing ::<id>
    expect(service.provider).toMatch(
      /^urn:pulumi:prod::acme-infra::pulumi:providers:gcp::default_[\d_]+$/,
    );
    // internal provider keys are dropped
    expect(Object.keys(service.outputs).some((key) => key.startsWith('__'))).toBe(false);

    const component = snapshot.resources.find((r) => r.type === 'acme:infra:cloud-sql')!;
    expect(component.managed).toBe(false);
    expect(component.providerType).toBeNull();
  });

  it('masks every secret and never exposes ciphertexts nor the secrets provider', async () => {
    const { store, find } = await stacksOf('project-layout');
    const snapshot = await engine.readSnapshot(store, '.pulumi/', find('acme-infra', 'prod'), {
      maxBytes: MAX,
    });
    const users = snapshot.resources.filter((r) => r.type === 'gcp:sql/user:User');
    expect(users.length).toBeGreaterThan(0);
    for (const user of users) {
      expect(user.inputs.password).toEqual({ $iac: 'secret' });
    }
    const text = JSON.stringify(snapshot);
    expect(text).not.toContain(FAKE_CIPHERTEXT);
    expect(text).not.toMatch(
      /ciphertext|secrets_providers|"salt"|4dabf18193072939515e22adb298388d/,
    );
  });

  it('turns resource references into links', async () => {
    const { store, find } = await stacksOf('project-layout');
    const snapshot = await engine.readSnapshot(store, '.pulumi/', find('acme-infra', 'prod'), {
      maxBytes: MAX,
    });
    const refs = JSON.stringify(snapshot).match(/"\$iac":"resource-ref"/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
  });

  it('reads gzipped states and empty stacks', async () => {
    const { store, find } = await stacksOf('project-layout');
    const staging = await engine.readSnapshot(store, '.pulumi/', find('acme-infra', 'staging'), {
      maxBytes: MAX,
    });
    expect(staging.resources).toHaveLength(45);
    const empty = await engine.readSnapshot(store, '.pulumi/', find('acme-platform', 'dev'), {
      maxBytes: MAX,
    });
    expect(empty.resources).toEqual([]);
    expect(empty.outputs).toEqual({});
  });

  it('reads the legacy layout', async () => {
    const { store, discovery, find } = await stacksOf('legacy-layout');
    expect(discovery.layout).toBe('legacy');
    const prod = find('acme-legacy', 'prod');
    expect(prod.ref.layout).toBe('legacy');
    const snapshot = await engine.readSnapshot(store, '.pulumi/', prod, { maxBytes: MAX });
    expect(snapshot.resources[0].address).toMatch(/^urn:pulumi:prod::acme-legacy::/);
    const updates = await engine.listUpdates(store, '.pulumi/', prod, { limit: 10, maxBytes: MAX });
    expect(updates.map((u) => u.id)).toEqual(['1795604216162649000', '1795602803296701000']);
  });

  it('fails cleanly past the size limit', async () => {
    const { store, find } = await stacksOf('project-layout');
    await expect(
      engine.readSnapshot(store, '.pulumi/', find('acme-infra', 'prod'), { maxBytes: 10_000 }),
    ).rejects.toThrow(/larger than/);
  });

  it('lists updates, newest first, with an allow-listed environment', async () => {
    const { store, find } = await stacksOf('project-layout');
    const updates = await engine.listUpdates(store, '.pulumi/', find('acme-infra', 'prod'), {
      limit: 10,
      maxBytes: MAX,
    });
    expect(updates.map((u) => [u.id, u.kind, u.result])).toEqual([
      ['1795604216162649000', 'update', 'succeeded'],
      ['1795602803296701000', 'update', 'succeeded'],
      ['1795602066945844000', 'update', 'succeeded'],
      ['1789061079158069310', 'update', 'failed'],
    ]);
    expect(updates[0]).toMatchObject({
      changes: { same: 146, update: 2 },
      toolVersion: 'v3.276.0',
      snapshotAvailable: true,
      vcs: {
        kind: 'github.com',
        owner: 'Acme',
        repo: 'acme-infra',
        branch: 'main',
        author: 'Jane Doe',
      },
    });
    expect(updates[0].startedAt).toBe(new Date(1795604139 * 1000).toISOString());
    // secret config values masked; no emails nor local paths
    expect(updates[0].config['acme-infra:sqlApiUserPassword']).toEqual({ $iac: 'secret' });
    const text = JSON.stringify(updates);
    expect(text).not.toMatch(/jane@example\.com|\/usr\/local|v1:/);

    const limited = await engine.listUpdates(store, '.pulumi/', find('acme-infra', 'prod'), {
      limit: 1,
      maxBytes: MAX,
    });
    expect(limited.map((u) => u.id)).toEqual(['1795604216162649000']);
  });

  it('reads gzipped history and other kinds', async () => {
    const { store, find } = await stacksOf('project-layout');
    const updates = await engine.listUpdates(store, '.pulumi/', find('acme-infra', 'staging'), {
      limit: 10,
      maxBytes: MAX,
    });
    expect(updates.map((u) => u.kind).sort()).toEqual(['import', 'refresh']);
  });

  it('reports the lock of an operation in progress, without who holds it', async () => {
    const { store, find } = await stacksOf('project-layout');
    expect(await engine.readLock(store, '.pulumi/', find('acme-infra', 'prod'))).toEqual({
      since: '2026-11-25T10:56:00.000000Z',
    });
    expect(await engine.readLock(store, '.pulumi/', find('acme-infra', 'staging'))).toBeNull();
  });
});

describe('normalizeValue', () => {
  const SIG = '4dabf18193072939515e22adb298388d';
  it('handles every special value', () => {
    expect(
      normalizeValue({ [SIG]: '1b47061264138c4ac30d75fd1eb44270', ciphertext: 'v1:x' }),
    ).toEqual({
      $iac: 'secret',
    });
    expect(
      normalizeValue({ [SIG]: '1b47061264138c4ac30d75fd1eb44270', plaintext: '"pw"' }),
    ).toEqual({
      $iac: 'secret',
    });
    expect(
      normalizeValue({ [SIG]: 'd0e6a833031e9bbcd3f4e8bde6ca49a4', secret: true, value: 'pw' }),
    ).toEqual({
      $iac: 'secret',
    });
    expect(normalizeValue({ [SIG]: 'd0e6a833031e9bbcd3f4e8bde6ca49a4', value: 'ok' })).toBe('ok');
    expect(
      normalizeValue({ [SIG]: 'c44067f5952c0a294b673a41bacd8c17', path: './index.js' }),
    ).toEqual({
      $iac: 'asset',
      summary: './index.js',
    });
    expect(normalizeValue({ [SIG]: 'unknown-signature', anything: 'secret?' })).toEqual({
      $iac: 'secret',
    });
    expect(normalizeValue({ ciphertext: 'v1:x' })).toEqual({ $iac: 'secret' });
    expect(normalizeValue('04da6b54-80e4-46f7-96ec-b56ff0331ba9')).toEqual({ $iac: 'unknown' });
    expect(normalizeValue({ nested: [{ [SIG]: '1b47061264138c4ac30d75fd1eb44270' }] })).toEqual({
      nested: [{ $iac: 'secret' }],
    });
  });

  it('refuses checkpoints newer than it understands', () => {
    const ref = {
      backendId: 'b',
      engine: 'pulumi' as const,
      project: 'p',
      stack: 's',
      layout: 'project' as const,
    };
    expect(() =>
      parseCheckpoint('{"version":4,"checkpoint":{}}', ref, {
        source: 'current',
        versionId: null,
        sizeBytes: 1,
      }),
    ).toThrow(UnsupportedStateVersionError);
    expect(() =>
      parseCheckpoint('nope', ref, { source: 'current', versionId: null, sizeBytes: 1 }),
    ).toThrow(/not valid JSON/);
  });
});
