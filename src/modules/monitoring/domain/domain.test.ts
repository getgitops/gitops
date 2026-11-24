import { describe, expect, it } from 'vitest';
import type { CheckOutcome, CheckStatus } from '#lib/monitoring/types';
import {
  HourAccumulator,
  buildBars,
  compactHours,
  hourStart,
  mergeAggregates,
  percentile,
  uptimeRatio,
  type IncidentRow,
} from './aggregates';
import { applyCheck, initialState } from './status-tracker';
import { displayUrl } from './monitor.domain';

const T0 = Date.parse('2026-11-20T10:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;

function check(status: CheckStatus, at: number, extra: Partial<CheckOutcome> = {}): CheckOutcome {
  return {
    status,
    cause: status === 'up' ? null : 'unexpected_status',
    httpStatus: status === 'down' ? 503 : 200,
    latencyMs: 100,
    error: null,
    startedAt: new Date(at).toISOString(),
    endedAt: new Date(at + 100).toISOString(),
    ...extra,
  };
}

describe('status tracker', () => {
  it('opens an incident only after the confirmations, starting at the first failure', () => {
    const state = initialState();
    expect(applyCheck(state, check('up', T0), 2)).toBeNull();
    expect(state.status).toBe('up');

    expect(applyCheck(state, check('down', T0 + MIN), 2)).toBeNull();
    const opened = applyCheck(state, check('down', T0 + 2 * MIN), 2);
    expect(opened).toMatchObject({
      kind: 'opened',
      status: 'down',
      previous: 'up',
      startedAt: new Date(T0 + MIN).toISOString(),
    });
    expect(state).toMatchObject({ status: 'down', failedChecks: 2 });
  });

  it('ignores a single blip', () => {
    const state = initialState();
    applyCheck(state, check('up', T0), 2);
    applyCheck(state, check('down', T0 + MIN), 2);
    expect(applyCheck(state, check('up', T0 + 2 * MIN), 2)).toBeNull();
    expect(state.status).toBe('up');
    expect(state.streak).toBeNull();
  });

  it('recovers on the first good check and reports what it closed', () => {
    const state = initialState();
    applyCheck(state, check('down', T0), 1);
    state.incidentId = 'incident-1';
    applyCheck(state, check('down', T0 + MIN), 1);
    const recovered = applyCheck(state, check('up', T0 + 2 * MIN), 1);
    expect(recovered).toMatchObject({
      kind: 'recovered',
      previous: 'down',
      closedIncidentId: 'incident-1',
      closedFailedChecks: 2,
    });
    expect(state).toMatchObject({ status: 'up', incidentId: null, failedChecks: 0 });
  });

  it('switches between down and degraded after the confirmations', () => {
    const state = initialState();
    applyCheck(state, check('degraded', T0), 1);
    state.incidentId = 'degraded-1';
    const changed = applyCheck(state, check('down', T0 + MIN), 1);
    expect(changed).toMatchObject({
      kind: 'changed',
      status: 'down',
      previous: 'degraded',
      closedIncidentId: 'degraded-1',
    });
  });
});

describe('aggregates', () => {
  it('computes percentiles and hour starts', () => {
    expect(percentile([5, 1, 3, 2, 4], 95)).toBe(5);
    expect(percentile([], 95)).toBeNull();
    expect(hourStart('2026-11-20T10:59:59.999Z')).toBe('2026-11-20T10:00:00.000Z');
  });

  it('accumulates an hour, skipping latency of failed connections', () => {
    const acc = new HourAccumulator(hourStart(T0));
    acc.add(check('up', T0, { latencyMs: 100 }));
    acc.add(check('degraded', T0 + MIN, { latencyMs: 300 }));
    acc.add(check('down', T0 + 2 * MIN, { httpStatus: null, latencyMs: 9_999, cause: 'timeout' }));
    expect(acc.toAggregate()).toEqual({
      total: 3,
      up: 1,
      degraded: 1,
      down: 1,
      latencyAvg: 200,
      latencyP95: 300,
      latencyMax: 300,
    });
  });

  it('merges weighted by checks and compacts hours into days', () => {
    const merged = mergeAggregates([
      {
        total: 60,
        up: 60,
        degraded: 0,
        down: 0,
        latencyAvg: 100,
        latencyP95: 150,
        latencyMax: 200,
      },
      {
        total: 20,
        up: 10,
        degraded: 0,
        down: 10,
        latencyAvg: 500,
        latencyP95: 900,
        latencyMax: 1200,
      },
    ]);
    expect(merged).toMatchObject({
      total: 80,
      up: 70,
      down: 10,
      latencyAvg: 200,
      latencyMax: 1200,
    });

    const days = compactHours([
      {
        monitorId: 'm',
        projectId: 'p',
        hour: '2026-10-01T00:00:00.000Z',
        total: 60,
        up: 60,
        degraded: 0,
        down: 0,
        latencyAvg: 100,
        latencyP95: 100,
        latencyMax: 100,
      },
      {
        monitorId: 'm',
        projectId: 'p',
        hour: '2026-10-01T23:00:00.000Z',
        total: 60,
        up: 60,
        degraded: 0,
        down: 0,
        latencyAvg: 300,
        latencyP95: 300,
        latencyMax: 300,
      },
      {
        monitorId: 'm',
        projectId: 'p',
        hour: '2026-10-02T00:00:00.000Z',
        total: 60,
        up: 0,
        degraded: 0,
        down: 60,
        latencyAvg: null,
        latencyP95: null,
        latencyMax: null,
      },
    ]);
    expect(days).toHaveLength(2);
    expect(days.find((day) => day.day === '2026-10-01')).toMatchObject({
      total: 120,
      latencyAvg: 200,
    });
  });

  it('computes time-based uptime from incidents; degraded counts as up', () => {
    const incidents: IncidentRow[] = [
      {
        id: 'a',
        monitorId: 'm',
        projectId: 'p',
        status: 'down',
        cause: 'timeout',
        httpStatus: null,
        error: null,
        startedAt: new Date(T0 + 10 * MIN).toISOString(),
        endedAt: new Date(T0 + 16 * MIN).toISOString(),
        failedChecks: 6,
      },
      {
        id: 'b',
        monitorId: 'm',
        projectId: 'p',
        status: 'degraded',
        cause: 'slow_response',
        httpStatus: 200,
        error: null,
        startedAt: new Date(T0 + 20 * MIN).toISOString(),
        endedAt: null,
        failedChecks: 3,
      },
    ];
    const input = { incidents, monitoredFrom: T0, now: T0 + HOUR };
    expect(uptimeRatio(input, T0, T0 + HOUR)).toBeCloseTo(0.9, 5);
    // before the monitor existed there is nothing to measure
    expect(uptimeRatio(input, T0 - 2 * HOUR, T0 - HOUR)).toBeNull();
  });

  it('builds hourly bars with status from incidents and counters', () => {
    const now = T0 + 2 * HOUR + 30 * MIN;
    const bars = buildBars(
      {
        incidents: [
          {
            id: 'a',
            monitorId: 'm',
            projectId: 'p',
            status: 'down',
            cause: null,
            httpStatus: null,
            error: null,
            startedAt: new Date(T0 + HOUR + 5 * MIN).toISOString(),
            endedAt: new Date(T0 + HOUR + 7 * MIN).toISOString(),
            failedChecks: 2,
          },
        ],
        monitoredFrom: T0,
        now,
        hours: [
          {
            monitorId: 'm',
            projectId: 'p',
            hour: new Date(T0).toISOString(),
            total: 60,
            up: 59,
            degraded: 1,
            down: 0,
            latencyAvg: 90,
            latencyP95: 120,
            latencyMax: 300,
          },
          {
            monitorId: 'm',
            projectId: 'p',
            hour: new Date(T0 + HOUR).toISOString(),
            total: 60,
            up: 58,
            degraded: 0,
            down: 2,
            latencyAvg: 95,
            latencyP95: 130,
            latencyMax: 400,
          },
        ],
        days: [],
        current: {
          hour: new Date(T0 + 2 * HOUR).toISOString(),
          total: 30,
          up: 30,
          degraded: 0,
          down: 0,
          latencyAvg: 80,
          latencyP95: 100,
          latencyMax: 110,
        },
      },
      'hour',
      4,
    );
    expect(bars.map((bar) => bar.status)).toEqual(['none', 'degraded', 'down', 'up']);
    expect(bars[2].downSeconds).toBe(120);
    expect(bars[3].uptime).toBe(1);
  });
});

describe('displayUrl', () => {
  it('drops credentials and the query string', () => {
    expect(displayUrl('https://user:pw@api.example.com/health?token=abc')).toBe(
      'https://api.example.com/health',
    );
    expect(displayUrl('https://example.com/')).toBe('https://example.com');
  });
});
