import { describe, expect, it } from 'vitest';
import type { IacSnapshot, IacUpdate } from '../domain/iac.model';
import type { IacDiff } from './state-diff.service';
import {
  buildDashboard,
  environmentWarnings,
  stackHealth,
  weekStart,
  INACTIVE_MS,
  STALE_LOCK_MS,
} from './stack-dashboard';
import { createStateIacFixture, fixtureStore } from './testing';
import type { StackListItem } from './state-iac.service';

const NOW = Date.parse('2026-11-25T12:30:00Z'); // a Wednesday
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

function update(over: Partial<IacUpdate> = {}): IacUpdate {
  return {
    id: '1',
    kind: 'update',
    result: 'succeeded',
    startedAt: iso(NOW - 1000),
    endedAt: iso(NOW - 500),
    message: '',
    changes: {},
    toolVersion: 'v3.1.0',
    vcs: {
      kind: null,
      owner: null,
      repo: null,
      commit: null,
      branch: null,
      dirty: null,
      author: null,
    },
    execKind: null,
    config: {},
    snapshotAvailable: true,
    ...over,
  };
}

function stack(over: Partial<StackListItem> & { name?: string } = {}): StackListItem {
  const { name = 'prod', ...rest } = over;
  return {
    ref: { backendId: 'b1', engine: 'pulumi', project: 'infra', stack: name, layout: 'project' },
    resourceCount: 10,
    updatedAt: iso(NOW - DAY),
    toolVersion: 'v3.1.0',
    lastUpdate: update({ startedAt: iso(NOW - DAY), endedAt: iso(NOW - DAY) }),
    lock: null,
    pendingOperations: 0,
    sizeBytes: 1,
    assignedProjectId: 'p1',
    error: null,
    ...rest,
  };
}

describe('stackHealth', () => {
  it('ok when nothing is wrong', () => {
    expect(stackHealth(stack(), null, NOW)).toEqual({ level: 'ok', reasons: [] });
  });

  it.each([
    ['read_error', stack({ error: 'too_large' }), null],
    ['backend_error', stack(), 'access_denied'],
    ['last_update_failed', stack({ lastUpdate: update({ result: 'failed' }) }), null],
    ['pending_operations', stack({ pendingOperations: 2 }), null],
  ] as const)('critical: %s', (reason, input, backendError) => {
    expect(stackHealth(input, backendError, NOW)).toEqual({ level: 'critical', reasons: [reason] });
  });

  it('a lock is only a warning after more than an hour', () => {
    const lock = (age: number) => stack({ lock: { since: iso(NOW - age) } });
    expect(stackHealth(lock(STALE_LOCK_MS), null, NOW).level).toBe('ok');
    expect(stackHealth(lock(STALE_LOCK_MS + 1), null, NOW)).toEqual({
      level: 'warn',
      reasons: ['stale_lock'],
    });
    expect(stackHealth(stack({ lock: { since: null } }), null, NOW).level).toBe('ok');
  });

  it('inactive after 30 days; without history it uses the state date', () => {
    const old = iso(NOW - INACTIVE_MS - 1);
    expect(
      stackHealth(stack({ lastUpdate: update({ endedAt: old, startedAt: old }) }), null, NOW),
    ).toEqual({ level: 'warn', reasons: ['inactive'] });
    expect(stackHealth(stack({ lastUpdate: null, updatedAt: old }), null, NOW).reasons).toEqual([
      'inactive',
    ]);
    const edge = iso(NOW - INACTIVE_MS);
    expect(stackHealth(stack({ lastUpdate: null, updatedAt: edge }), null, NOW).level).toBe('ok');
  });

  it('critical wins over warnings but keeps every reason', () => {
    const health = stackHealth(
      stack({ pendingOperations: 1, lock: { since: iso(NOW - 2 * STALE_LOCK_MS) } }),
      null,
      NOW,
    );
    expect(health).toEqual({ level: 'critical', reasons: ['pending_operations', 'stale_lock'] });
  });
});

describe('buildDashboard', () => {
  const resource = (
    type: string,
    over: Partial<IacSnapshot['resources'][number]['flags']> = {},
    extra: { managed?: boolean; providerType?: string | null } = {},
  ) =>
    ({
      address: `urn:${type}:${Math.random()}`,
      type,
      name: 'r',
      parent: null,
      provider: null,
      providerType: extra.providerType === undefined ? 'gcp' : extra.providerType,
      externalId: null,
      managed: extra.managed ?? true,
      flags: {
        protect: false,
        retainOnDelete: false,
        external: false,
        pendingReplacement: false,
        pendingDelete: false,
        ...over,
      },
      inputs: {},
      outputs: {},
      dependencies: [],
      createdAt: null,
      modifiedAt: null,
    }) as IacSnapshot['resources'][number];

  it('resource stats: top types with "others", providers, protected and pending', () => {
    const resources = [
      resource('pulumi:pulumi:Stack', {}, { managed: false, providerType: null }),
      ...Array.from({ length: 10 }, (_, i) => resource(`gcp:t${i}:T`, {}, {})),
      resource('gcp:t0:T', { protect: true }),
      resource('gcp:t1:T', { pendingReplacement: true }),
      resource('gcp:t2:T', { pendingDelete: true }),
      resource('app:Component', {}, { managed: false, providerType: null }),
    ];
    const dashboard = buildDashboard({
      summary: stack(),
      snapshot: { resources } as IacSnapshot,
      updates: null,
      diff: null,
      backendError: null,
      now: NOW,
    });
    const stats = dashboard.resources!;
    expect(stats).toMatchObject({
      total: 14,
      managed: 13,
      components: 1,
      protected: 1,
      pendingChange: 2,
    });
    expect(stats.topTypes).toHaveLength(8);
    expect(stats.topTypes[0]).toEqual({ type: 'gcp:t0:T', count: 2 });
    // 11 types (t0..t9 + the component), 8 shown: the 3 left have one resource each
    expect(stats.otherCount).toBe(3);
    expect(stats.byProvider).toEqual([{ provider: 'gcp', count: 13 }]);
    expect(dashboard.deployments).toBeNull();
    expect(dashboard.lastChanges).toBeNull();
  });

  it('weeks align to Monday UTC, 13 buckets, 30-day success rate and deploys per week', () => {
    expect(iso(weekStart(NOW))).toBe('2026-11-23T00:00:00.000Z');
    const at = (days: number, result: IacUpdate['result']) =>
      update({ result, startedAt: iso(NOW - days * DAY), endedAt: iso(NOW - days * DAY) });
    const updates = [
      at(0.1, 'succeeded'), // this week (Wed)
      at(1, 'failed'), // Tue, this week
      at(3, 'succeeded'), // Sun: previous week
      at(10, 'succeeded'),
      at(35, 'failed'), // out of the 30-day window, inside the weeks
      at(200, 'succeeded'), // out of the 13 weeks
      at(2, 'in-progress'), // not a deploy
    ];
    const { deployments } = buildDashboard({
      summary: stack(),
      snapshot: null,
      updates,
      diff: null,
      backendError: null,
      now: NOW,
    });
    expect(deployments!.weeks).toHaveLength(13);
    expect(deployments!.weeks[12]).toEqual({
      start: '2026-11-23T00:00:00.000Z',
      succeeded: 1,
      failed: 1,
    });
    expect(deployments!.weeks[11]).toMatchObject({
      start: '2026-11-16T00:00:00.000Z',
      succeeded: 1,
    });
    expect(deployments!.weeks.reduce((n, w) => n + w.succeeded + w.failed, 0)).toBe(5);
    expect(deployments!.window).toEqual({ days: 30, total: 4, succeeded: 3, rate: 0.75 });
    expect(deployments!.perWeek).toBe(0.9);
    expect(deployments!.recent).toHaveLength(5);
  });

  it('no updates in the window: no rate', () => {
    const { deployments } = buildDashboard({
      summary: stack(),
      snapshot: null,
      updates: [],
      diff: null,
      backendError: null,
      now: NOW,
    });
    expect(deployments!.window.rate).toBeNull();
    expect(deployments!.perWeek).toBeNull();
  });

  it('last changes skip provider-only resources and trim the list', () => {
    const changes = Array.from({ length: 10 }, (_, i) => ({
      address: `a${i}`,
      type: 't',
      name: `n${i}`,
      change: 'update' as const,
      providerOnly: false,
      fields: [
        { path: 'inputs.a', secret: false },
        { path: 'inputs.b', secret: false },
        { path: 'inputs.c', secret: false },
      ],
    }));
    const diff = {
      from: { sourceId: 'history:1', takenAt: null },
      to: { sourceId: 'history:2', takenAt: null },
      summary: { create: 0, delete: 0, update: 12, replace: 0, same: 3, providerOnly: 2 },
      resources: [
        ...changes,
        { ...changes[0], address: 'p1', providerOnly: true },
        { ...changes[0], address: 'p2', providerOnly: true },
      ],
      outputs: [],
    } as IacDiff;
    const { lastChanges } = buildDashboard({
      summary: stack({ lastUpdate: update({ changes: { same: 146, update: 2 } }) }),
      snapshot: null,
      updates: null,
      diff,
      backendError: null,
      now: NOW,
    });
    expect(lastChanges!.resources).toHaveLength(8);
    expect(lastChanges!.resources[0].paths).toEqual(['inputs.a', 'inputs.b']);
    expect(lastChanges!.moreCount).toBe(2);
    expect(lastChanges!.providerOnlyCount).toBe(2);
    expect(lastChanges!.to).toBe('history:2');
  });

  it('keeps the last update changes as the fallback', () => {
    const dashboard = buildDashboard({
      summary: stack({ lastUpdate: update({ changes: { create: 1, delete: 2 } }) }),
      snapshot: null,
      updates: null,
      diff: null,
      backendError: null,
      now: NOW,
    });
    expect(dashboard.updateChanges).toEqual({ create: 1, delete: 2 });
  });
});

describe('environmentWarnings', () => {
  const selected = { backendId: 'b1', project: 'infra', stack: 'prod' };

  it('no warnings when everything matches', () => {
    expect(environmentWarnings([stack(), stack({ name: 'staging' })], selected, NOW)).toEqual([]);
  });

  it('Pulumi versions that differ name every stack', () => {
    const warnings = environmentWarnings(
      [stack(), stack({ name: 'staging', toolVersion: 'v3.2.0' })],
      selected,
      NOW,
    );
    expect(warnings).toEqual([
      {
        kind: 'version_drift',
        stacks: [
          { project: 'infra', stack: 'prod', version: 'v3.1.0' },
          { project: 'infra', stack: 'staging', version: 'v3.2.0' },
        ],
      },
    ]);
  });

  it('another stack that failed is a warning, the selected one is its own health', () => {
    const failed = update({ result: 'failed', endedAt: iso(NOW - 1000) });
    const warnings = environmentWarnings(
      [stack({ lastUpdate: failed }), stack({ name: 'staging', lastUpdate: failed })],
      selected,
      NOW,
    );
    expect(warnings).toEqual([
      { kind: 'stack_failed', stack: { project: 'infra', stack: 'staging' }, at: failed.endedAt },
    ]);
  });

  it('stale locks on any stack', () => {
    const since = iso(NOW - 2 * STALE_LOCK_MS);
    const warnings = environmentWarnings(
      [stack({ name: 'staging', lock: { since } }), stack({ lock: { since: iso(NOW - 1000) } })],
      selected,
      NOW,
    );
    expect(warnings).toEqual([
      { kind: 'stale_lock', stack: { project: 'infra', stack: 'staging' }, since },
    ]);
  });
});

describe('StateIacService.dashboard (fixtures)', () => {
  it('prod of the project-layout bucket', async () => {
    const fx = createStateIacFixture();
    const backend = await fx.backendService.create('org-1', {
      name: 'shared',
      provider: 'gcs',
      bucket: 'shared-state',
    });
    fx.buckets.set('shared-state', fixtureStore('project-layout'));
    await fx.bindingService.set(backend, 'acme-infra', { projectId: 'p1' });
    const located = await fx.stateIacService.locate(
      { projectId: 'p1' },
      backend.id,
      'acme-infra',
      'prod',
    );
    const now = Date.parse('2026-11-25T12:30:00Z');

    const full = await fx.stateIacService.dashboard(located!, {
      withStates: true,
      withHistory: true,
      now,
    });
    // the lock (since 10:56) is 1 h 34 min old
    expect(full.health).toEqual({ level: 'warn', reasons: ['stale_lock'] });
    expect(full.lastUpdate).toMatchObject({ result: 'succeeded' });
    expect(full.updateChanges).toEqual({ same: 146, update: 2 });
    expect(full.resources!.managed).toBeGreaterThan(0);
    expect(full.deployments!.recent.map((u) => u.id)).toContain('1789061079158069310');
    expect(full.deployments!.recent).toHaveLength(4);
    // all 4 updates are today or in September: 3 succeeded today in the 30-day window
    expect(full.deployments!.window.total).toBe(3);
    expect(full.deployments!.window.rate).toBe(1);
    expect(full.deployments!.weeks.at(-1)!.succeeded).toBe(3);
    expect(full.deployments!.weeks.reduce((n, w) => n + w.failed, 0)).toBe(1);
    expect(full.lastChanges).not.toBeNull();

    const early = await fx.stateIacService.dashboard(located!, {
      withStates: false,
      withHistory: false,
      now,
    });
    expect(early.resources).toBeNull();
    expect(early.deployments).toBeNull();
    expect(early.lastChanges).toBeNull();
    expect(early.health.level).toBe('warn');
  });
});
