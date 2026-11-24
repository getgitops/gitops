/**
 * Pure aggregate math: hourly accumulation, compaction into days, uptime and the status bars.
 *
 * Uptime is time-based, from incidents: `1 - down time / monitored time` within the window, so it
 * stays exact after hours are compacted into days. Degraded time counts as up (it answered), but
 * it is painted amber on the bars.
 */
import type { CheckOutcome, CheckStatus } from '#lib/monitoring/types';

export type Aggregate = {
  total: number;
  up: number;
  degraded: number;
  down: number;
  latencyAvg: number | null;
  latencyP95: number | null;
  latencyMax: number | null;
};

export type HourRow = Aggregate & { monitorId: string; projectId: string; hour: string };
export type DayRow = Aggregate & { monitorId: string; projectId: string; day: string };

export type IncidentRow = {
  id: string;
  monitorId: string;
  projectId: string;
  status: 'down' | 'degraded';
  cause: string | null;
  httpStatus: number | null;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
  failedChecks: number;
};

export type BarStatus = 'up' | 'degraded' | 'down' | 'none';

export type Bar = {
  start: string;
  end: string;
  status: BarStatus;
  /** 0..1, `null` when nothing was monitored in the slot. */
  uptime: number | null;
  checks: number;
  downSeconds: number;
  degradedSeconds: number;
  latencyAvg: number | null;
  latencyP95: number | null;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function hourStart(date: Date | number | string): string {
  const time = new Date(date).getTime();
  return new Date(time - (time % HOUR_MS)).toISOString();
}

export function dayKey(date: Date | number | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function emptyAggregate(): Aggregate {
  return {
    total: 0,
    up: 0,
    degraded: 0,
    down: 0,
    latencyAvg: null,
    latencyP95: null,
    latencyMax: null,
  };
}

/** Counters of the hour in progress for one monitor. */
export class HourAccumulator {
  hour: string;
  total = 0;
  up = 0;
  degraded = 0;
  down = 0;
  latencies: number[] = [];
  lastCheck: CheckOutcome | null = null;

  constructor(hour: string) {
    this.hour = hour;
  }

  static restore(row: {
    hour: string;
    total: number;
    up: number;
    degraded: number;
    down: number;
    latencies: unknown;
    lastCheck?: unknown;
  }): HourAccumulator {
    const acc = new HourAccumulator(row.hour);
    acc.total = row.total;
    acc.up = row.up;
    acc.degraded = row.degraded;
    acc.down = row.down;
    acc.latencies = Array.isArray(row.latencies)
      ? (row.latencies as unknown[]).filter((v): v is number => typeof v === 'number')
      : [];
    acc.lastCheck = (row.lastCheck as CheckOutcome | null) ?? null;
    return acc;
  }

  add(outcome: CheckOutcome): void {
    this.total++;
    this[outcome.status satisfies CheckStatus]++;
    // a failed connection has no meaningful latency
    if (outcome.httpStatus !== null) this.latencies.push(outcome.latencyMs);
    this.lastCheck = outcome;
  }

  toAggregate(): Aggregate {
    const count = this.latencies.length;
    return {
      total: this.total,
      up: this.up,
      degraded: this.degraded,
      down: this.down,
      latencyAvg: count ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / count) : null,
      latencyP95: percentile(this.latencies, 95),
      latencyMax: count ? Math.max(...this.latencies) : null,
    };
  }
}

/**
 * Sums aggregates. Averages and p95 are weighted by the checks of each part (the p95 of a merge
 * is an approximation: the samples themselves are gone by then).
 */
export function mergeAggregates(parts: readonly Aggregate[]): Aggregate {
  const result = emptyAggregate();
  let avgWeight = 0;
  let avgSum = 0;
  let p95Sum = 0;
  for (const part of parts) {
    result.total += part.total;
    result.up += part.up;
    result.degraded += part.degraded;
    result.down += part.down;
    const weight = part.total;
    if (part.latencyAvg !== null && weight > 0) {
      avgSum += part.latencyAvg * weight;
      p95Sum += (part.latencyP95 ?? part.latencyAvg) * weight;
      avgWeight += weight;
    }
    if (part.latencyMax !== null) {
      result.latencyMax = Math.max(result.latencyMax ?? 0, part.latencyMax);
    }
  }
  if (avgWeight > 0) {
    result.latencyAvg = Math.round(avgSum / avgWeight);
    result.latencyP95 = Math.round(p95Sum / avgWeight);
  }
  return result;
}

/** Groups hourly rows into one row per monitor and UTC day. */
export function compactHours(hours: readonly HourRow[]): DayRow[] {
  const groups = new Map<
    string,
    { monitorId: string; projectId: string; day: string; rows: HourRow[] }
  >();
  for (const row of hours) {
    const day = dayKey(row.hour);
    const key = `${row.monitorId}:${day}`;
    const group = groups.get(key) ?? {
      monitorId: row.monitorId,
      projectId: row.projectId,
      day,
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    monitorId: group.monitorId,
    projectId: group.projectId,
    day: group.day,
    ...mergeAggregates(group.rows),
  }));
}

/** Milliseconds of `[from, to)` covered by incidents of `status`; open incidents last until `now`. */
export function incidentOverlapMs(
  incidents: readonly IncidentRow[],
  from: number,
  to: number,
  status: 'down' | 'degraded',
  now: number,
): number {
  let total = 0;
  for (const incident of incidents) {
    if (incident.status !== status) continue;
    const start = Math.max(from, new Date(incident.startedAt).getTime());
    const end = Math.min(to, incident.endedAt ? new Date(incident.endedAt).getTime() : now);
    if (end > start) total += end - start;
  }
  return total;
}

export type UptimeInput = {
  incidents: readonly IncidentRow[];
  /** When the monitor started being checked (creation). */
  monitoredFrom: number;
  now: number;
};

/** Uptime ratio over `[from, to)`, or `null` when the monitor did not exist yet. */
export function uptimeRatio(input: UptimeInput, from: number, to: number): number | null {
  const start = Math.max(from, input.monitoredFrom);
  const end = Math.min(to, input.now);
  if (end <= start) return null;
  const down = incidentOverlapMs(input.incidents, start, end, 'down', input.now);
  return Math.max(0, 1 - down / (end - start));
}

export type BarsInput = UptimeInput & {
  hours: readonly HourRow[];
  days: readonly DayRow[];
  current: (Aggregate & { hour: string }) | null;
};

/**
 * Status bars, oldest first. `unit: 'hour'` gives `count` hourly bars ending with the current hour;
 * `unit: 'day'` gives `count` daily bars ending today (UTC).
 */
export function buildBars(input: BarsInput, unit: 'hour' | 'day', count: number): Bar[] {
  const size = unit === 'hour' ? HOUR_MS : DAY_MS;
  const lastStart =
    unit === 'hour'
      ? new Date(hourStart(input.now)).getTime()
      : Date.parse(`${dayKey(input.now)}T00:00:00.000Z`);

  const byHour = new Map<string, Aggregate>();
  for (const row of input.hours) byHour.set(row.hour, row);
  if (input.current) byHour.set(input.current.hour, input.current);
  const byDay = new Map<string, Aggregate[]>();
  for (const row of input.days) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);

  const bars: Bar[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = lastStart - i * size;
    const end = start + size;
    let aggregate: Aggregate;
    if (unit === 'hour') {
      aggregate = byHour.get(new Date(start).toISOString()) ?? emptyAggregate();
    } else {
      const parts = [...(byDay.get(dayKey(start)) ?? [])];
      for (let h = start; h < end; h += HOUR_MS) {
        const hour = byHour.get(new Date(h).toISOString());
        if (hour) parts.push(hour);
      }
      aggregate = mergeAggregates(parts);
    }

    const windowStart = Math.max(start, input.monitoredFrom);
    const windowEnd = Math.min(end, input.now);
    const monitored = windowEnd > windowStart;
    const downMs = monitored
      ? incidentOverlapMs(input.incidents, windowStart, windowEnd, 'down', input.now)
      : 0;
    const degradedMs = monitored
      ? incidentOverlapMs(input.incidents, windowStart, windowEnd, 'degraded', input.now)
      : 0;

    let status: BarStatus;
    if (!monitored || (aggregate.total === 0 && downMs === 0 && degradedMs === 0)) status = 'none';
    else if (downMs > 0) status = 'down';
    else if (degradedMs > 0 || aggregate.down > 0 || aggregate.degraded > 0) status = 'degraded';
    else status = 'up';

    bars.push({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      status,
      uptime: status === 'none' ? null : Math.max(0, 1 - downMs / (windowEnd - windowStart)),
      checks: aggregate.total,
      downSeconds: Math.round(downMs / 1000),
      degradedSeconds: Math.round(degradedMs / 1000),
      latencyAvg: aggregate.latencyAvg,
      latencyP95: aggregate.latencyP95,
    });
  }
  return bars;
}
