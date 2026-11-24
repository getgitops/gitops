import { lt } from '@getgitops/gitdb';
import type { CachedGitDb } from '#lib/server/gitdb/cached-client';
import {
  MonitoringCurrentEntity,
  MonitoringDailyEntity,
  MonitoringHourlyEntity,
  MonitoringIncidentEntity,
} from '#lib/database/schemas';
import type { CheckOutcome } from '#lib/monitoring/types';
import type { Aggregate, DayRow, HourRow, IncidentRow } from '../../domain/aggregates';

export type CurrentRow = Aggregate & {
  monitorId: string;
  projectId: string;
  hour: string;
  latencies: number[];
  lastCheck: CheckOutcome | null;
};

type Row = Record<string, unknown>;

function where(test: (row: Row) => boolean, debug: string) {
  return { kind: 'predicate' as const, test, debug };
}

function inList(field: string, values: readonly string[]) {
  const set = new Set(values);
  return where((row) => set.has(String(row[field])), `${field} in [${values.length}]`);
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function aggregateOf(row: Row): Aggregate {
  return {
    total: num(row.total),
    up: num(row.up),
    degraded: num(row.degraded),
    down: num(row.down),
    latencyAvg: numOrNull(row.latencyAvg),
    latencyP95: numOrNull(row.latencyP95),
    latencyMax: numOrNull(row.latencyMax),
  };
}

function toIncident(row: Row): IncidentRow {
  return {
    id: String(row.id),
    monitorId: String(row.monitorId),
    projectId: String(row.projectId),
    status: row.status === 'degraded' ? 'degraded' : 'down',
    cause: (row.cause as string | null) ?? null,
    httpStatus: numOrNull(row.httpStatus),
    error: (row.error as string | null) ?? null,
    startedAt: String(row.startedAt),
    endedAt: (row.endedAt as string | null) ?? null,
    failedChecks: num(row.failedChecks),
  };
}

export function hourRowId(monitorId: string, hour: string): string {
  return `${monitorId}:${hour}`;
}

export function dayRowId(monitorId: string, day: string): string {
  return `${monitorId}:${day}`;
}

/**
 * Reads and writes the `monitoring_*` tables of the metrics GitDB. Every method is one GitDB
 * write at most per table, and GitDB folds writes made close together into one commit.
 */
export class MonitoringStoreRepository {
  constructor(private readonly db: () => CachedGitDb) {}

  async listOpenIncidents(): Promise<IncidentRow[]> {
    const { rows } = await this.db()
      .select()
      .from(MonitoringIncidentEntity)
      .where(where((row) => !row.endedAt, 'endedAt is null'));
    return rows.map(toIncident);
  }

  async listIncidents(monitorIds: readonly string[], since?: string): Promise<IncidentRow[]> {
    if (monitorIds.length === 0) return [];
    const conditions = [inList('monitorId', monitorIds)];
    if (since) {
      conditions.push(
        where((row) => !row.endedAt || String(row.endedAt) >= since, `endedAt >= ${since}`),
      );
    }
    const { rows } = await this.db()
      .select()
      .from(MonitoringIncidentEntity)
      .where(where((row) => conditions.every((c) => c.test(row)), 'incidents'))
      .orderBy('startedAt', 'desc');
    return rows.map(toIncident);
  }

  async insertIncident(incident: IncidentRow): Promise<void> {
    await this.db()
      .insert(MonitoringIncidentEntity)
      .values({ ...incident });
  }

  async closeIncident(id: string, endedAt: string, failedChecks: number): Promise<void> {
    await this.db().update(MonitoringIncidentEntity).set({ endedAt, failedChecks }).where({ id });
  }

  async listCurrent(): Promise<CurrentRow[]> {
    const { rows } = await this.db().select().from(MonitoringCurrentEntity);
    return rows.map((row) => ({
      ...aggregateOf(row),
      monitorId: String(row.id),
      projectId: String(row.projectId),
      hour: String(row.hour),
      latencies: Array.isArray(row.latencies) ? (row.latencies as number[]) : [],
      lastCheck: (row.lastCheck as CheckOutcome | null) ?? null,
    }));
  }

  /** Replaces the whole hour-in-progress snapshot (one row per monitor). */
  async replaceCurrent(rows: readonly CurrentRow[]): Promise<void> {
    const db = this.db();
    await db.delete(MonitoringCurrentEntity).where(where(() => true, 'all'));
    if (rows.length === 0) return;
    await db
      .insert(MonitoringCurrentEntity)
      .values(rows.map(({ monitorId, ...row }) => ({ ...row, id: monitorId })));
  }

  /** Inserts closed hours; an hour already stored (same monitor and hour) is merged into it. */
  async saveHours(rows: readonly HourRow[]): Promise<void> {
    if (rows.length === 0) return;
    const db = this.db();
    const ids = rows.map((row) => hourRowId(row.monitorId, row.hour));
    const { rows: existing } = await db
      .select()
      .from(MonitoringHourlyEntity)
      .where(inList('id', ids));
    const existingIds = new Set(existing.map((row) => String(row.id)));
    const fresh = rows.filter((row) => !existingIds.has(hourRowId(row.monitorId, row.hour)));
    if (fresh.length > 0) {
      await db
        .insert(MonitoringHourlyEntity)
        .values(fresh.map((row) => ({ ...row, id: hourRowId(row.monitorId, row.hour) })));
    }
  }

  async listHours(monitorIds: readonly string[], since: string): Promise<HourRow[]> {
    if (monitorIds.length === 0) return [];
    const ids = new Set(monitorIds);
    const { rows } = await this.db()
      .select()
      .from(MonitoringHourlyEntity)
      .where(
        where(
          (row) => ids.has(String(row.monitorId)) && String(row.hour) >= since,
          `hours since ${since}`,
        ),
      );
    return rows.map((row) => ({
      ...aggregateOf(row),
      monitorId: String(row.monitorId),
      projectId: String(row.projectId),
      hour: String(row.hour),
    }));
  }

  async listDays(monitorIds: readonly string[], sinceDay: string): Promise<DayRow[]> {
    if (monitorIds.length === 0) return [];
    const ids = new Set(monitorIds);
    const { rows } = await this.db()
      .select()
      .from(MonitoringDailyEntity)
      .where(
        where(
          (row) => ids.has(String(row.monitorId)) && String(row.day) >= sinceDay,
          `days since ${sinceDay}`,
        ),
      );
    return rows.map((row) => ({
      ...aggregateOf(row),
      monitorId: String(row.monitorId),
      projectId: String(row.projectId),
      day: String(row.day),
    }));
  }

  /** Hours older than `cutoff`, to be compacted. */
  async listHoursBefore(cutoff: string): Promise<HourRow[]> {
    const { rows } = await this.db()
      .select()
      .from(MonitoringHourlyEntity)
      .where(lt('hour', cutoff));
    return rows.map((row) => ({
      ...aggregateOf(row),
      monitorId: String(row.monitorId),
      projectId: String(row.projectId),
      hour: String(row.hour),
    }));
  }

  async deleteHoursBefore(cutoff: string): Promise<void> {
    await this.db().delete(MonitoringHourlyEntity).where(lt('hour', cutoff));
  }

  /** Stores day rows, replacing the ones with the same monitor and day. */
  async replaceDays(rows: readonly DayRow[]): Promise<void> {
    if (rows.length === 0) return;
    const db = this.db();
    const ids = rows.map((row) => dayRowId(row.monitorId, row.day));
    await db.delete(MonitoringDailyEntity).where(inList('id', ids));
    await db
      .insert(MonitoringDailyEntity)
      .values(rows.map((row) => ({ ...row, id: dayRowId(row.monitorId, row.day) })));
  }

  async listDaysByIds(ids: readonly string[]): Promise<DayRow[]> {
    if (ids.length === 0) return [];
    const { rows } = await this.db().select().from(MonitoringDailyEntity).where(inList('id', ids));
    return rows.map((row) => ({
      ...aggregateOf(row),
      monitorId: String(row.monitorId),
      projectId: String(row.projectId),
      day: String(row.day),
    }));
  }

  async deleteIncidentsEndedBefore(cutoff: string): Promise<void> {
    await this.db()
      .delete(MonitoringIncidentEntity)
      .where(
        where((row) => Boolean(row.endedAt) && String(row.endedAt) < cutoff, `ended < ${cutoff}`),
      );
  }

  /** Everything stored about monitors that no longer exist. */
  async deleteMonitorData(monitorIds: readonly string[]): Promise<void> {
    if (monitorIds.length === 0) return;
    const db = this.db();
    const condition = inList('monitorId', monitorIds);
    await db.delete(MonitoringIncidentEntity).where(condition);
    await db.delete(MonitoringHourlyEntity).where(condition);
    await db.delete(MonitoringDailyEntity).where(condition);
    await db.delete(MonitoringCurrentEntity).where(inList('id', monitorIds));
  }

  /** Monitor ids with any stored metric, to clean up after deleted monitors. */
  async listKnownMonitorIds(): Promise<string[]> {
    const db = this.db();
    const ids = new Set<string>();
    for (const entity of [
      MonitoringIncidentEntity,
      MonitoringHourlyEntity,
      MonitoringDailyEntity,
    ]) {
      const { rows } = await db.select({ monitorId: true }).from(entity);
      for (const row of rows) ids.add(String(row.monitorId));
    }
    return [...ids];
  }
}
