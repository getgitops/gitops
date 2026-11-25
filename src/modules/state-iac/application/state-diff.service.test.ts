import { describe, expect, it } from 'vitest';
import type { IacResource, IacSnapshot } from '../domain/iac.model';
import { PulumiStateEngine } from '../infrastructure/engines/pulumi/pulumi-state-engine';
import type { EngineStack } from '../infrastructure/engines/state-engine';
import { diffSnapshots, sameValue } from './state-diff.service';
import { fixtureStore } from './testing';

const engine = new PulumiStateEngine();
const MAX = 50 * 1024 * 1024;

async function prodHistory() {
  const store = fixtureStore('project-layout');
  const discovery = await engine.discoverStacks(store, '.pulumi/', 'b1');
  const prod = discovery.stacks.find((s) => s.ref.stack === 'prod') as EngineStack;
  const read = async (id: string) =>
    (await engine.readSnapshotSource(store, '.pulumi/', prod, id, { maxBytes: MAX }))!;
  return { store, prod, read };
}

const byChange = (diff: ReturnType<typeof diffSnapshots>, change: string) =>
  diff.resources.filter((r) => r.change === change).map((r) => r.name);

describe('diffSnapshots on real consecutive states', () => {
  it('a replace: same URN, new cloud id (the managed certificate)', async () => {
    const { read } = await prodHistory();
    const diff = diffSnapshots(
      await read('history:1795602066945844000'),
      await read('history:1795602803296701000'),
    );
    expect(diff.summary).toMatchObject({ create: 0, delete: 0, replace: 1 });
    expect(byChange(diff, 'replace')).toEqual(['lb-prod-cert']);
    const cert = diff.resources.find((r) => r.name === 'lb-prod-cert')!;
    expect(cert.fields.map((f) => f.path)).toContain('externalId');
    // the history entry says: replace 1, update 3; the raw JSON comparison flags ~30
    expect(diff.summary.replace + diff.summary.update).toBe(4);
  });

  it('a 2-resource update with property-level changes', async () => {
    const { read } = await prodHistory();
    const diff = diffSnapshots(
      await read('history:1795602803296701000'),
      await read('history:1795604216162649000'),
    );
    expect(diff.summary).toMatchObject({ create: 0, delete: 0, replace: 0, update: 2 });
    expect(byChange(diff, 'update').sort()).toEqual(['acme-prod', 'cloud-sql-acme-prod']);
    const component = diff.resources.find((r) => r.name === 'cloud-sql-acme-prod')!;
    expect(component.fields).toEqual([
      expect.objectContaining({ path: 'inputs.publicIp', secret: false }),
    ]);
  });

  it('re-encrypted secrets are not changes (Pulumi uses a fresh nonce on every write)', async () => {
    const { read } = await prodHistory();
    const diff = diffSnapshots(
      await read('history:1795602803296701000'),
      await read('history:1795604216162649000'),
    );
    // every fixture ciphertext differs between both files, yet no secret field shows up
    expect(diff.resources.flatMap((r) => r.fields).some((f) => f.secret)).toBe(false);
    expect(JSON.stringify(diff)).not.toMatch(/ciphertext|v1:/);
  });

  it('creates, deletes and a provider upgrade shown as provider-only changes', async () => {
    const { read } = await prodHistory();
    const diff = diffSnapshots(
      await read('history:1789061079158069310'),
      await read('history:1795602066945844000'),
    );
    expect(diff.summary.create).toBe(6);
    expect(diff.summary.delete).toBe(1);
    expect(diff.summary.providerOnly).toBeGreaterThan(0);
    const providerOnly = diff.resources.filter((r) => r.providerOnly);
    expect(providerOnly.every((r) => r.fields.every((f) => f.path === 'provider'))).toBe(true);
    // ordered: replace, create, delete, update
    const order = diff.resources.map((r) => r.change);
    expect(order.indexOf('create')).toBeLessThan(order.lastIndexOf('update'));
    expect(diff.outputs.map((o) => o.path)).toContain('pulseThemeTokenSecretId');
  });

  it('the current state against itself has no changes', async () => {
    const { read } = await prodHistory();
    const current = await read('current');
    expect(diffSnapshots(current, current).summary).toMatchObject({
      create: 0,
      delete: 0,
      update: 0,
      replace: 0,
      same: current.resources.length,
    });
  });
});

describe('diffSnapshots rules', () => {
  const resource = (overrides: Partial<IacResource> = {}): IacResource => ({
    address: 'urn:pulumi:dev::p::aws:s3/bucket:Bucket::logs',
    type: 'aws:s3/bucket:Bucket',
    name: 'logs',
    parent: null,
    provider: 'urn:pulumi:dev::p::pulumi:providers:aws::default',
    providerType: 'aws',
    externalId: 'logs-123',
    managed: true,
    flags: {
      protect: false,
      retainOnDelete: false,
      external: false,
      pendingReplacement: false,
      pendingDelete: false,
    },
    inputs: {},
    outputs: {},
    dependencies: [],
    createdAt: null,
    modifiedAt: null,
    ...overrides,
  });
  const snapshot = (resources: IacResource[], outputs = {}): IacSnapshot => ({
    ref: { backendId: 'b', engine: 'pulumi', project: 'p', stack: 'dev', layout: 'project' },
    source: 'history',
    versionId: null,
    takenAt: null,
    toolVersion: null,
    resources,
    outputs,
    pendingOperations: 0,
    sizeBytes: 0,
  });

  it('never reveals a secret, and says when a value became or stopped being secret', () => {
    const before = resource({ inputs: { password: { $iac: 'secret' }, user: 'admin' } });
    const after = resource({ inputs: { password: 'plain-now', user: { $iac: 'secret' } } });
    const diff = diffSnapshots(snapshot([before]), snapshot([after]));
    const fields = diff.resources[0].fields;
    expect(fields).toEqual([
      { path: 'inputs.password', before: { $iac: 'secret' }, after: 'plain-now', secret: true },
      { path: 'inputs.user', before: 'admin', after: { $iac: 'secret' }, secret: true },
    ]);
    // secret → secret is "same"
    const same = diffSnapshots(snapshot([before]), snapshot([resource({ inputs: before.inputs })]));
    expect(same.summary.same).toBe(1);
  });

  it('dependencies compare as sets and nested values down to the leaves', () => {
    const dep = (n: string) => `urn:pulumi:dev::p::aws:iam/role:Role::${n}`;
    const before = resource({
      dependencies: [dep('a'), dep('b')],
      inputs: { tags: { env: 'dev', team: 'x' }, ports: [80, 443] },
    });
    const reordered = resource({ ...before, dependencies: [dep('b'), dep('a')] });
    expect(diffSnapshots(snapshot([before]), snapshot([reordered])).summary.same).toBe(1);

    const after = resource({
      dependencies: [dep('b'), dep('c')],
      inputs: { tags: { env: 'prod', team: 'x' }, ports: [80, 8443] },
    });
    const fields = diffSnapshots(snapshot([before]), snapshot([after])).resources[0].fields;
    expect(fields).toEqual([
      { path: 'inputs.ports[1]', before: 443, after: 8443, secret: false },
      { path: 'inputs.tags.env', before: 'dev', after: 'prod', secret: false },
      { path: 'dependencies', before: [dep('a')], after: [dep('c')], secret: false },
    ]);
  });

  it('sameValue treats every secret as equal', () => {
    expect(sameValue({ $iac: 'secret' }, { $iac: 'secret' })).toBe(true);
    expect(sameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});
