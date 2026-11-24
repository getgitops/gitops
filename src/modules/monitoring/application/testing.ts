import type { CheckOutcome } from '#lib/monitoring/types';
import type { DayRow, HourRow, IncidentRow } from '../domain/aggregates';
import type { MonitorRecord } from '../domain/monitor.domain';
import type { MonitorStore, MonitorWrite } from '../infrastructure/repositories/monitor.repository';
import type { CurrentRow } from '../infrastructure/repositories/monitoring-store.repository';
import type { MetricsStore } from './monitoring-runtime';

/** In-memory `MetricsStore` for tests. */
export class InMemoryMetricsStore implements MetricsStore {
  incidents: IncidentRow[] = [];
  hours: HourRow[] = [];
  days: DayRow[] = [];
  current: CurrentRow[] = [];
  writes = 0;

  async listOpenIncidents() {
    return this.incidents.filter((row) => !row.endedAt);
  }
  async listIncidents(ids: readonly string[], since?: string) {
    return this.incidents
      .filter(
        (row) => ids.includes(row.monitorId) && (!since || !row.endedAt || row.endedAt >= since),
      )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  async insertIncident(row: IncidentRow) {
    this.writes++;
    this.incidents.push({ ...row });
  }
  async closeIncident(id: string, endedAt: string, failedChecks: number) {
    this.writes++;
    const row = this.incidents.find((incident) => incident.id === id);
    if (row) Object.assign(row, { endedAt, failedChecks });
  }
  async listCurrent() {
    return this.current.map((row) => ({ ...row }));
  }
  async replaceCurrent(rows: readonly CurrentRow[]) {
    this.writes++;
    this.current = rows.map((row) => ({ ...row, latencies: [...row.latencies] }));
  }
  async saveHours(rows: readonly HourRow[]) {
    if (rows.length) this.writes++;
    for (const row of rows) {
      if (!this.hours.some((h) => h.monitorId === row.monitorId && h.hour === row.hour))
        this.hours.push({ ...row });
    }
  }
  async listHours(ids: readonly string[], since: string) {
    return this.hours.filter((row) => ids.includes(row.monitorId) && row.hour >= since);
  }
  async listDays(ids: readonly string[], sinceDay: string) {
    return this.days.filter((row) => ids.includes(row.monitorId) && row.day >= sinceDay);
  }
  async listHoursBefore(cutoff: string) {
    return this.hours.filter((row) => row.hour < cutoff);
  }
  async deleteHoursBefore(cutoff: string) {
    this.hours = this.hours.filter((row) => row.hour >= cutoff);
  }
  async replaceDays(rows: readonly DayRow[]) {
    for (const row of rows) {
      this.days = this.days.filter((d) => !(d.monitorId === row.monitorId && d.day === row.day));
      this.days.push({ ...row });
    }
  }
  async listDaysByIds(ids: readonly string[]) {
    return this.days.filter((row) => ids.includes(`${row.monitorId}:${row.day}`));
  }
  async deleteIncidentsEndedBefore(cutoff: string) {
    this.incidents = this.incidents.filter((row) => !row.endedAt || row.endedAt >= cutoff);
  }
  async deleteMonitorData(ids: readonly string[]) {
    this.incidents = this.incidents.filter((row) => !ids.includes(row.monitorId));
    this.hours = this.hours.filter((row) => !ids.includes(row.monitorId));
    this.days = this.days.filter((row) => !ids.includes(row.monitorId));
    this.current = this.current.filter((row) => !ids.includes(row.monitorId));
  }
  async listKnownMonitorIds() {
    return [
      ...new Set([...this.incidents, ...this.hours, ...this.days].map((row) => row.monitorId)),
    ];
  }
}

/** In-memory `MonitorStore` for tests. */
export class InMemoryMonitorStore implements MonitorStore {
  rows: MonitorRecord[] = [];
  private tick = 0;

  private stamp() {
    return new Date(Date.UTC(2026, 0, 1) + ++this.tick).toISOString();
  }
  async listAll() {
    return this.rows.map((row) => ({ ...row }));
  }
  async listByProject(projectId: string) {
    return this.rows.filter((row) => row.projectId === projectId).map((row) => ({ ...row }));
  }
  async findById(id: string) {
    const row = this.rows.find((monitor) => monitor.id === id);
    return row ? { ...row } : null;
  }
  async create(input: MonitorWrite) {
    const now = this.stamp();
    const row = { ...input, createdAt: now, updatedAt: now };
    this.rows.push(row);
    return { ...row };
  }
  async update(id: string, changes: Partial<MonitorWrite>) {
    const row = this.rows.find((monitor) => monitor.id === id);
    if (!row) throw new Error('Monitor not found');
    Object.assign(row, changes, { updatedAt: this.stamp() });
    return { ...row };
  }
  async delete(id: string) {
    this.rows = this.rows.filter((row) => row.id !== id);
  }
}

export function outcome(
  status: CheckOutcome['status'],
  at: number,
  extra: Partial<CheckOutcome> = {},
): CheckOutcome {
  return {
    status,
    cause: status === 'up' ? null : status === 'degraded' ? 'slow_response' : 'unexpected_status',
    httpStatus: status === 'down' ? 503 : 200,
    latencyMs: status === 'degraded' ? 2_500 : 120,
    error: status === 'up' ? null : 'failed',
    startedAt: new Date(at).toISOString(),
    endedAt: new Date(at + 120).toISOString(),
    ...extra,
  };
}
