import { beforeEach, describe, expect, it } from 'vitest';
import type { StateBackendDomain } from '../domain/state-backend.domain';
import { createStateIacFixture, fixtureStore } from './testing';
import { UNKNOWN_PROJECT } from './state-iac.service';

const names = (groups: { stacks: { ref: { project: string | null; stack: string } }[] }[]) =>
  groups.flatMap((group) => group.stacks.map((s) => `${s.ref.project}/${s.ref.stack}`));

describe('StateIacService', () => {
  let fx: ReturnType<typeof createStateIacFixture>;
  let shared: StateBackendDomain;

  beforeEach(async () => {
    fx = createStateIacFixture();
    // one bucket holding the stacks of two GitOps projects
    shared = await fx.backendService.create('org-1', {
      name: 'shared',
      provider: 'gcs',
      bucket: 'shared-state',
    });
    fx.buckets.set('shared-state', fixtureStore('project-layout'));
    await fx.bindingService.set(shared, 'acme-infra', { projectId: 'p1', stacks: ['prod'] });
    await fx.bindingService.set(shared, 'acme-platform', { projectId: 'p2' });
  });

  describe('visibility', () => {
    it('a project only lists the stacks assigned to it', async () => {
      expect(names(await fx.stateIacService.listProjectStacks('p1'))).toEqual(['acme-infra/prod']);
      expect(names(await fx.stateIacService.listProjectStacks('p2'))).toEqual([
        'acme-platform/dev',
      ]);
      expect(await fx.stateIacService.listProjectStacks('nobody')).toEqual([]);
    });

    it('the organization lists every stack with the project it is assigned to', async () => {
      const groups = await fx.stateIacService.listOrganizationStacks('org-1');
      expect(
        groups[0].stacks.map((s) => [`${s.ref.project}/${s.ref.stack}`, s.assignedProjectId]),
      ).toEqual([
        ['acme-infra/prod', 'p1'],
        ['acme-infra/staging', null],
        ['acme-platform/dev', 'p2'],
      ]);
      expect(await fx.stateIacService.listOrganizationStacks('org-2')).toEqual([]);
    });

    it('a stack not assigned to the project, or assigned to another one, is not found', async () => {
      const { getProjectStack } = fx.stateIacService;
      const get = getProjectStack.bind(fx.stateIacService);
      expect(await get('p1', shared.id, 'acme-infra', 'prod')).not.toBeNull();
      // same Pulumi project, stack not in the binding
      expect(await get('p1', shared.id, 'acme-infra', 'staging')).toBeNull();
      // assigned to p2
      expect(await get('p1', shared.id, 'acme-platform', 'dev')).toBeNull();
      expect(await get('p2', shared.id, 'acme-infra', 'prod')).toBeNull();
      // does not exist at all
      expect(await get('p1', shared.id, 'acme-infra', 'nope')).toBeNull();
    });

    it("the organization opens any stack of its backends, not another organization's", async () => {
      const detail = await fx.stateIacService.getOrganizationStack(
        'org-1',
        shared.id,
        'acme-infra',
        'staging',
      );
      expect(detail?.summary.assignedProjectId).toBeNull();
      expect(detail?.snapshot.resources).toHaveLength(45);
      expect(
        await fx.stateIacService.getOrganizationStack('org-2', shared.id, 'acme-infra', 'staging'),
      ).toBeNull();
    });

    it('summarizes each stack: resources, last update, lock', async () => {
      const [group] = await fx.stateIacService.listProjectStacks('p1');
      expect(group.backend).toMatchObject({ name: 'shared', location: 'gs://shared-state' });
      expect(group.stacks[0]).toMatchObject({
        resourceCount: 48,
        toolVersion: 'v3.276.0',
        pendingOperations: 0,
        lock: { since: '2026-11-25T10:56:00.000000Z' },
        lastUpdate: { id: '1795604216162649000', kind: 'update', result: 'succeeded' },
        error: null,
      });
    });

    it('legacy stacks without a project are only reachable from the organization', async () => {
      const legacy = await fx.backendService.create('org-1', {
        name: 'legacy',
        provider: 's3',
        bucket: 'legacy-state',
      });
      const store = fixtureStore('legacy-layout');
      store.put(
        '.pulumi/stacks/new.json',
        '{"version":3,"checkpoint":{"stack":"new","latest":{}}}',
      );
      fx.buckets.set('legacy-state', store);
      const detail = await fx.stateIacService.getOrganizationStack(
        'org-1',
        legacy.id,
        UNKNOWN_PROJECT,
        'new',
      );
      expect(detail?.summary.ref).toMatchObject({ project: null, stack: 'new', layout: 'legacy' });
    });
  });

  describe('failures', () => {
    it('a backend that fails does not break the others and records its error', async () => {
      const broken = await fx.backendService.create('org-1', {
        name: 'broken',
        provider: 'gcs',
        bucket: 'broken-state',
      });
      const store = fixtureStore('project-layout');
      store.failWith = Object.assign(new Error('denied'), { code: 403 });
      fx.buckets.set('broken-state', store);
      await fx.bindingService.set(broken, 'acme-infra', { projectId: 'p1' });

      const groups = await fx.stateIacService.listProjectStacks('p1');
      expect(groups.map((g) => [g.backend.name, g.error, g.stacks.length])).toEqual([
        ['shared', null, 1],
        ['broken', 'access_denied', 0],
      ]);
      expect(fx.backends.rows.find((row) => row.id === broken.id)?.lastError).toBe('access_denied');
    });

    it('a state over the size limit is listed with an error', async () => {
      fx.config.maxStateBytes = 10_000;
      const [group] = await fx.stateIacService.listProjectStacks('p1');
      expect(group.stacks[0]).toMatchObject({ error: 'too_large', resourceCount: 0 });
    });

    it('disabled backends are not read', async () => {
      await fx.backendService.update(shared.id, { enabled: false });
      expect(await fx.stateIacService.listProjectStacks('p1')).toEqual([]);
    });
  });

  describe('cache', () => {
    const stateReads = (store: ReturnType<typeof fixtureStore>) =>
      store.calls.filter((c) => c.op === 'get' && c.key.startsWith('.pulumi/stacks/')).length;

    it('reuses listings for the TTL and unchanged states after it', async () => {
      const store = fx.buckets.get('shared-state')!;
      await fx.stateIacService.listOrganizationStacks('org-1');
      const lists = store.calls.filter((c) => c.op === 'list').length;
      const reads = stateReads(store);
      expect(reads).toBe(3);

      await fx.stateIacService.listOrganizationStacks('org-1');
      expect(store.calls.filter((c) => c.op === 'list').length).toBe(lists);
      expect(stateReads(store)).toBe(reads);

      // TTL over: listed again, but the states have the same version and are not read again
      fx.advance(61_000);
      await fx.stateIacService.listOrganizationStacks('org-1');
      expect(store.calls.filter((c) => c.op === 'list').length).toBeGreaterThan(lists);
      expect(stateReads(store)).toBe(reads);
    });

    it('reads a state again when its object changes, and on refresh', async () => {
      const store = fx.buckets.get('shared-state')!;
      await fx.stateIacService.listProjectStacks('p2');
      const reads = stateReads(store);

      store.put(
        '.pulumi/stacks/acme-platform/dev.json',
        '{"version":3,"checkpoint":{"stack":"organization/acme-platform/dev","latest":{"resources":[{"urn":"urn:pulumi:dev::acme-platform::pulumi:pulumi:Stack::acme-platform-dev","type":"pulumi:pulumi:Stack","outputs":{"url":"https://x"}}]}}}',
      );
      const [group] = await fx.stateIacService.listProjectStacks('p2', { refresh: true });
      expect(stateReads(store)).toBe(reads + 1);
      const detail = await fx.stateIacService.getProjectStack(
        'p2',
        shared.id,
        'acme-platform',
        'dev',
      );
      expect(detail?.snapshot.outputs).toEqual({ url: 'https://x' });
      expect(group.stacks[0].resourceCount).toBe(0);
    });
  });

  describe('history and diff', () => {
    const locate = (fx: ReturnType<typeof createStateIacFixture>, id: string, stack = 'prod') =>
      fx.stateIacService.locate({ projectId: 'p1' }, id, 'acme-infra', stack);

    it('locate follows the same visibility as the detail', async () => {
      expect(await locate(fx, shared.id)).not.toBeNull();
      expect(await locate(fx, shared.id, 'staging')).toBeNull();
      expect(
        await fx.stateIacService.locate(
          { organizationId: 'org-2' },
          shared.id,
          'acme-infra',
          'prod',
        ),
      ).toBeNull();
    });

    it('pages the history, newest first', async () => {
      const located = (await locate(fx, shared.id))!;
      const first = await fx.stateIacService.history(located, { limit: 3 });
      expect(first.updates.map((u) => u.id)).toEqual([
        '1795604216162649000',
        '1795602803296701000',
        '1795602066945844000',
      ]);
      expect(first.nextCursor).toBe('1795602066945844000');
      const second = await fx.stateIacService.history(located, {
        limit: 3,
        cursor: first.nextCursor,
      });
      expect(second.updates.map((u) => [u.id, u.result])).toEqual([
        ['1789061079158069310', 'failed'],
      ]);
      expect(second.nextCursor).toBeNull();
    });

    it('lists every source: current, history, backups, retained copies and the .bak', async () => {
      const sources = await fx.stateIacService.snapshotSources((await locate(fx, shared.id))!);
      expect(sources[0].id).toBe('current');
      expect(sources.map((source) => source.source).sort()).toEqual(
        [
          'backup',
          'current',
          'history',
          'history',
          'history',
          'history',
          'previous',
          'retained',
        ].sort(),
      );
      expect(sources.find((s) => s.id === 'history:1795604216162649000')).toMatchObject({
        updateId: '1795604216162649000',
        takenAt: new Date(1795604216162).toISOString(),
      });
    });

    it('by default compares the last update with the one before', async () => {
      const outcome = await fx.stateIacService.diff((await locate(fx, shared.id))!);
      expect(outcome.to).toBe('history:1795604216162649000');
      expect(outcome.from).toBe('history:1795602803296701000');
      expect(outcome.diff?.summary).toMatchObject({ update: 2, create: 0, delete: 0, replace: 0 });
      expect(outcome.diff?.from.sourceId).toBe('history:1795602803296701000');
    });

    it('compares any two sources, and refuses unknown ones', async () => {
      const located = (await locate(fx, shared.id))!;
      const outcome = await fx.stateIacService.diff(located, {
        from: 'history:1795602066945844000',
        to: 'current',
      });
      expect(outcome.diff?.summary.replace).toBe(1);
      const unknown = await fx.stateIacService.diff(located, { from: 'history:1', to: 'current' });
      expect(unknown.diff).toBeNull();
      const traversal = await fx.stateIacService.diff(located, {
        from: 'backup:../../x',
        to: 'current',
      });
      expect(traversal.diff).toBeNull();
    });

    it('uses object versions when the bucket keeps them', async () => {
      const store = fixtureStore('project-layout');
      store.versioning = true;
      const key = '.pulumi/stacks/acme-platform/dev.json';
      const empty =
        '{"version":3,"checkpoint":{"stack":"organization/acme-platform/dev","latest":{}}}';
      store.put(key, empty, '2026-11-01T00:00:00Z');
      store.put(
        key,
        '{"version":3,"checkpoint":{"stack":"organization/acme-platform/dev","latest":{"resources":[{"urn":"urn:pulumi:dev::acme-platform::aws:s3/bucket:Bucket::logs","type":"aws:s3/bucket:Bucket","custom":true,"id":"logs"}]}}}',
        '2026-11-02T00:00:00Z',
      );
      fx.buckets.set('shared-state', store);
      fx.stateIacService.invalidate(shared.id);
      const located = (await fx.stateIacService.locate(
        { projectId: 'p2' },
        shared.id,
        'acme-platform',
        'dev',
      ))!;
      const sources = await fx.stateIacService.snapshotSources(located);
      // the fixture's dev.json was version 1 (before versioning), then 2 and 3 (live)
      expect(sources.map((s) => s.id).sort()).toEqual(['current', 'previous', 'version:2']);
      const outcome = await fx.stateIacService.diff(located, { from: 'version:2', to: 'current' });
      expect(outcome.diff?.summary.create).toBe(1);
      // no history: by default, current against the newest other source
      const byDefault = await fx.stateIacService.diff(located);
      expect(byDefault.to).toBe('current');
      expect(byDefault.diff).not.toBeNull();
    });

    it('with only the current state there is nothing to compare', async () => {
      const located = (await fx.stateIacService.locate(
        { projectId: 'p2' },
        shared.id,
        'acme-platform',
        'dev',
      ))!;
      const outcome = await fx.stateIacService.diff(located, { from: 'version:9', to: 'current' });
      expect(outcome.diff).toBeNull();
    });
  });
});
