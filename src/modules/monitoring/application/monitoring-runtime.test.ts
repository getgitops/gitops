import { describe, expect, it } from 'vitest';
import { RecordingEventBus } from '#lib/server/events/testing';
import type { MonitorRecord } from '../domain/monitor.domain';
import { MonitoringRuntime } from './monitoring-runtime';
import { InMemoryMetricsStore, InMemoryMonitorStore, outcome } from './testing';

const T0 = Date.parse('2026-11-20T10:00:00.000Z');
const MIN = 60_000;

const silent = { info() {}, warn() {}, error() {}, debug() {} };

function monitor(overrides: Partial<MonitorRecord> = {}): MonitorRecord {
  return {
    id: 'monitor-1',
    projectId: 'project-1',
    serviceId: 'service-1',
    name: 'API',
    url: 'https://api.example.com/health?token=secret',
    method: 'GET',
    headerNames: ['Authorization'],
    secrets: 'encrypted',
    intervalSeconds: 60,
    timeoutMs: 5_000,
    expectedStatus: '200-299',
    degradedThresholdMs: 2_000,
    confirmations: 2,
    followRedirects: true,
    enabled: true,
    createdAt: new Date(T0 - 60 * MIN).toISOString(),
    updatedAt: new Date(T0 - 60 * MIN).toISOString(),
    ...overrides,
  };
}

async function setup(records: MonitorRecord[] = [monitor()], store = new InMemoryMetricsStore()) {
  let now = T0;
  let id = 0;
  const monitors = new InMemoryMonitorStore();
  monitors.rows = records;
  const events = new RecordingEventBus();
  const runtime = new MonitoringRuntime({
    monitors,
    store,
    decrypt: () => ({ headers: { Authorization: 'Bearer top-secret' }, body: null }),
    config: { flushSeconds: 300, hourlyRetentionDays: 30, incidentRetentionDays: 365 },
    logger: silent,
    events,
    projects: { getProject: async () => ({ organization: { id: 'org-1' } }) },
    now: () => now,
    newId: () => `id-${++id}`,
  });
  await runtime.start({ timers: false });
  return {
    runtime,
    store,
    events,
    monitors,
    at: (time: number) => {
      now = time;
    },
  };
}

describe('MonitoringRuntime', () => {
  it('leases a due check with the decrypted request and accepts its result once', async () => {
    const { runtime, at } = await setup();
    at(T0 + 61 * MIN);
    const lease = await runtime.lease({ workerId: 'w1', region: 'eu', capacity: 10 });
    expect(lease.checks).toHaveLength(1);
    expect(lease.checks[0].request.headers).toEqual({ Authorization: 'Bearer top-secret' });

    const result = {
      leaseId: lease.checks[0].leaseId,
      monitorId: 'monitor-1',
      outcome: outcome('up', T0 + 61 * MIN),
    };
    expect(await runtime.report({ workerId: 'w1', region: 'eu', results: [result] })).toEqual({
      accepted: 1,
      rejected: 0,
    });
    expect(await runtime.report({ workerId: 'w2', region: null, results: [result] })).toEqual({
      accepted: 0,
      rejected: 1,
    });
    expect(runtime.status('monitor-1').status).toBe('up');
    expect(runtime.activeWorkers().map((worker) => worker.workerId)).toEqual(['w1', 'w2']);
  });

  it('opens an incident on confirmed failure, publishes events, and closes it on recovery', async () => {
    const { runtime, store, events } = await setup();
    runtime.record('monitor-1', outcome('up', T0));
    runtime.record('monitor-1', outcome('down', T0 + MIN));
    await runtime.settle();
    expect(store.incidents).toHaveLength(0);

    runtime.record('monitor-1', outcome('down', T0 + 2 * MIN));
    await runtime.settle();
    expect(store.incidents).toEqual([
      expect.objectContaining({
        status: 'down',
        startedAt: new Date(T0 + MIN).toISOString(),
        endedAt: null,
        cause: 'unexpected_status',
        httpStatus: 503,
      }),
    ]);
    const down = events.events.find((event) => event.type === 'monitoring.monitor.down');
    expect(down?.payload).toMatchObject({
      monitorId: 'monitor-1',
      serviceId: 'service-1',
      url: 'https://api.example.com/health',
      status: 'down',
      previousStatus: 'up',
    });
    expect(JSON.stringify(down?.payload)).not.toContain('secret');
    expect(down?.scope).toEqual({ organizationId: 'org-1', projectId: 'project-1' });

    runtime.record('monitor-1', outcome('down', T0 + 3 * MIN));
    runtime.record('monitor-1', outcome('up', T0 + 4 * MIN));
    await runtime.settle();
    expect(store.incidents[0]).toMatchObject({
      endedAt: new Date(T0 + 4 * MIN).toISOString(),
      failedChecks: 3,
    });
    const recovered = events.events.find((event) => event.type === 'monitoring.monitor.recovered');
    expect(recovered?.payload).toMatchObject({ durationSeconds: 180, previousStatus: 'down' });
  });

  it('keeps counters in memory and only writes on flush, closed hours included', async () => {
    const { runtime, store, at } = await setup();
    for (let i = 0; i < 30; i++) runtime.record('monitor-1', outcome('up', T0 + i * MIN));
    await runtime.settle();
    expect(store.writes).toBe(0);

    await runtime.flush();
    expect(store.current).toEqual([
      expect.objectContaining({ monitorId: 'monitor-1', total: 30, up: 30 }),
    ]);

    at(T0 + 61 * MIN);
    runtime.record('monitor-1', outcome('up', T0 + 61 * MIN));
    await runtime.flush();
    expect(store.hours).toEqual([
      expect.objectContaining({ hour: new Date(T0).toISOString(), total: 30 }),
    ]);
    expect(store.current[0]).toMatchObject({
      hour: new Date(T0 + 60 * MIN).toISOString(),
      total: 1,
    });
  });

  it('restores open incidents and the hour in progress after a restart', async () => {
    const first = await setup();
    first.runtime.record('monitor-1', outcome('down', T0));
    first.runtime.record('monitor-1', outcome('down', T0 + MIN));
    await first.runtime.settle();
    await first.runtime.flush();

    const second = await setup([monitor()], first.store);
    expect(second.runtime.status('monitor-1')).toMatchObject({
      status: 'down',
      incidentId: first.store.incidents[0].id,
    });
    second.runtime.record('monitor-1', outcome('up', T0 + 2 * MIN));
    await second.runtime.settle();
    expect(first.store.incidents[0].endedAt).toBe(new Date(T0 + 2 * MIN).toISOString());
    second.at(T0 + 3 * MIN);
    const [stats] = await second.runtime.stats([monitor()]);
    expect(stats.hourlyBars.at(-1)).toMatchObject({ checks: 3, status: 'down' });
  });

  it('pausing a monitor closes its incident and stops scheduling it', async () => {
    const { runtime, store, at } = await setup();
    runtime.record('monitor-1', outcome('down', T0));
    runtime.record('monitor-1', outcome('down', T0 + MIN));
    runtime.monitorChanged(
      monitor({ enabled: false, updatedAt: new Date(T0 + 2 * MIN).toISOString() }),
    );
    await runtime.settle();
    expect(store.incidents[0].endedAt).not.toBeNull();
    expect(runtime.status('monitor-1').status).toBe('paused');
    at(T0 + 10 * MIN);
    expect((await runtime.lease({ workerId: 'w', region: null, capacity: 5 })).checks).toHaveLength(
      0,
    );
  });

  it('compacts hours past the retention into days and drops deleted monitors', async () => {
    const store = new InMemoryMetricsStore();
    const old = T0 - 40 * 24 * 60 * MIN;
    store.hours = [0, 1].map((h) => ({
      monitorId: 'monitor-1',
      projectId: 'project-1',
      hour: new Date(old + h * 60 * MIN).toISOString(),
      total: 60,
      up: 60,
      degraded: 0,
      down: 0,
      latencyAvg: 100 + h * 100,
      latencyP95: 200,
      latencyMax: 300,
    }));
    store.incidents = [
      {
        id: 'gone',
        monitorId: 'deleted',
        projectId: 'p',
        status: 'down',
        cause: null,
        httpStatus: null,
        error: null,
        startedAt: new Date(T0 - MIN).toISOString(),
        endedAt: null,
        failedChecks: 1,
      },
    ];
    const { runtime } = await setup([monitor()], store);
    await runtime.compact();
    expect(store.hours).toHaveLength(0);
    expect(store.days).toEqual([
      expect.objectContaining({ monitorId: 'monitor-1', total: 120, latencyAvg: 150 }),
    ]);
    expect(store.incidents).toHaveLength(0);
  });

  it('deleting a monitor drops it from the schedule and its metrics', async () => {
    const { runtime, store, at } = await setup();
    runtime.record('monitor-1', outcome('down', T0));
    runtime.record('monitor-1', outcome('down', T0 + MIN));
    await runtime.settle();
    runtime.monitorDeleted('monitor-1');
    await runtime.settle();
    expect(store.incidents).toHaveLength(0);
    at(T0 + 10 * MIN);
    expect((await runtime.lease({ workerId: 'w', region: null, capacity: 5 })).checks).toHaveLength(
      0,
    );
  });
});
