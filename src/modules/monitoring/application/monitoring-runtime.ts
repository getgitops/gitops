/**
 * The monitoring engine of the server process:
 *
 *   workers ──lease()──▶ scheduler ──▶ due checks
 *   workers ──report()─▶ record(): recent checks (memory) + hour counters + status tracker
 *                          ├─ status change → incident written right away + domain event
 *                          └─ every MONITORING_FLUSH_SECONDS → hour in progress saved
 *   hourly compaction: hours past the retention → one row per day; old incidents and the data of
 *   deleted monitors are removed.
 *
 * What a crash loses: the last checks (memory only) and up to one flush of hourly counters.
 * Incidents, and therefore downtime and uptime, are never lost.
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type {
  CheckOutcome,
  CheckRequest,
  LeaseRequest,
  LeaseResponse,
  MonitorStatus,
  MonitoringTransport,
  ReportRequest,
  ReportResponse,
} from '#lib/monitoring/types';
import { publishAfterWrite, type EventPublisher } from '#lib/server/events/publish';
import { resolveProjectScope, type ProjectScopeLookup } from '#lib/server/events/scope';
import {
  HourAccumulator,
  buildBars,
  compactHours,
  dayKey,
  hourStart,
  mergeAggregates,
  uptimeRatio,
  type Bar,
  type HourRow,
  type IncidentRow,
} from '../domain/aggregates';
import { displayUrl, type MonitorRecord, type MonitorSecrets } from '../domain/monitor.domain';
import { RECENT_CHECKS_PER_MONITOR } from '../domain/monitor-limits.data';
import {
  applyCheck,
  initialState,
  type TrackedState,
  type Transition,
} from '../domain/status-tracker';
import type { MonitorStore } from '../infrastructure/repositories/monitor.repository';
import type { MonitoringStoreRepository } from '../infrastructure/repositories/monitoring-store.repository';
import { MonitorScheduler } from './scheduler';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const RESYNC_MS = 60_000;
const WORKER_ACTIVE_MS = 2 * 60_000;
const MAX_IDLE_POLL_MS = 5_000;

export type MetricsStore = Pick<
  MonitoringStoreRepository,
  | 'listOpenIncidents'
  | 'listIncidents'
  | 'insertIncident'
  | 'closeIncident'
  | 'listCurrent'
  | 'replaceCurrent'
  | 'saveHours'
  | 'listHours'
  | 'listDays'
  | 'listHoursBefore'
  | 'deleteHoursBefore'
  | 'replaceDays'
  | 'listDaysByIds'
  | 'deleteIncidentsEndedBefore'
  | 'deleteMonitorData'
  | 'listKnownMonitorIds'
>;

export type RuntimeConfig = {
  flushSeconds: number;
  hourlyRetentionDays: number;
  incidentRetentionDays: number;
};

export type MonitoringRuntimeDeps = {
  monitors: Pick<MonitorStore, 'listAll'>;
  store: MetricsStore;
  decrypt: (record: MonitorRecord) => MonitorSecrets;
  config: RuntimeConfig;
  logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>;
  events?: EventPublisher;
  projects?: ProjectScopeLookup;
  now?: () => number;
  newId?: () => string;
};

export type MonitorLiveStatus = {
  status: MonitorStatus;
  since: string | null;
  incidentId: string | null;
  lastCheck: CheckOutcome | null;
};

export type MonitorStats = MonitorLiveStatus & {
  monitorId: string;
  uptime: { h24: number | null; d7: number | null; d30: number | null; d90: number | null };
  latency24h: { avg: number | null; p95: number | null; max: number | null };
  /** 24 hourly bars, oldest first, the last one is the hour in progress. */
  hourlyBars: Bar[];
  /** 90 daily bars, oldest first, the last one is today (UTC). */
  dailyBars: Bar[];
  openIncident: IncidentRow | null;
};

export type WorkerInfo = {
  workerId: string;
  region: string | null;
  lastSeenAt: string;
  leased: number;
  reported: number;
};

type CachedMonitor = { record: MonitorRecord; request: CheckRequest | null };

export class MonitoringRuntime implements MonitoringTransport {
  private readonly scheduler: MonitorScheduler;
  private readonly monitors = new Map<string, CachedMonitor>();
  private readonly trackers = new Map<string, TrackedState>();
  private readonly accumulators = new Map<string, HourAccumulator>();
  private readonly recent = new Map<string, CheckOutcome[]>();
  private readonly workers = new Map<string, WorkerInfo>();
  private pendingHours: HourRow[] = [];
  private writes: Promise<void> = Promise.resolve();
  private flushing: Promise<void> | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private soonFlush: ReturnType<typeof setTimeout> | null = null;
  private started: Promise<void> | null = null;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private readonly deps: MonitoringRuntimeDeps) {
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? randomUUID;
    this.scheduler = new MonitorScheduler(this.newId);
  }

  get isStarted(): boolean {
    return this.started !== null;
  }

  /** Loads monitors, open incidents and the hour in progress, then starts the timers. */
  start(options: { timers?: boolean } = {}): Promise<void> {
    this.started ??= this.boot(options.timers ?? true).catch((error) => {
      this.started = null;
      throw error;
    });
    return this.started;
  }

  private async boot(timers: boolean): Promise<void> {
    await this.reloadMonitors();
    const now = this.now();

    for (const incident of await this.deps.store.listOpenIncidents()) {
      const cached = this.monitors.get(incident.monitorId);
      if (!cached || !cached.record.enabled) {
        this.enqueue(() =>
          this.deps.store.closeIncident(
            incident.id,
            new Date(now).toISOString(),
            incident.failedChecks,
          ),
        );
        continue;
      }
      this.trackers.set(incident.monitorId, {
        ...initialState(incident.status),
        since: incident.startedAt,
        incidentId: incident.id,
        failedChecks: incident.failedChecks,
      });
    }

    const currentHour = hourStart(now);
    for (const row of await this.deps.store.listCurrent()) {
      if (!this.monitors.has(row.monitorId)) continue;
      const accumulator = HourAccumulator.restore(row);
      if (row.hour === currentHour) this.accumulators.set(row.monitorId, accumulator);
      else this.pendingHours.push(this.toHourRow(row.monitorId, accumulator));

      const tracker = this.trackerOf(row.monitorId);
      tracker.lastCheck = row.lastCheck;
      if (tracker.status === 'pending' && row.lastCheck?.status === 'up') tracker.status = 'up';
    }

    if (timers) {
      this.every(this.deps.config.flushSeconds * 1000, () => this.flush());
      this.every(RESYNC_MS, () => this.reloadMonitors());
      this.every(HOUR_MS, () => this.compact());
      const first = setTimeout(() => void this.compact().catch(() => {}), 60_000);
      first.unref?.();
    }
    this.deps.logger.info(
      { monitors: this.monitors.size, scheduled: this.scheduler.stats(now).monitors },
      '[monitoring] runtime started',
    );
  }

  /** Saves everything pending and stops the timers. */
  async stop(): Promise<void> {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    if (this.soonFlush) clearTimeout(this.soonFlush);
    await this.flush();
    await this.writes;
  }

  // ─── configuration ────────────────────────────────────────────────────────

  /** Re-reads every monitor (also picks up GitDB changes pulled from the remote). */
  async reloadMonitors(): Promise<void> {
    const records = await this.deps.monitors.listAll();
    const now = this.now();
    const seen = new Set<string>();
    for (const record of records) {
      seen.add(record.id);
      this.apply(record, now, false);
    }
    for (const id of [...this.monitors.keys()]) if (!seen.has(id)) this.forget(id);
  }

  /** A monitor was created or edited: reschedule it (and check it right away). */
  monitorChanged(record: MonitorRecord): void {
    this.apply(record, this.now(), true);
  }

  /** A monitor was deleted: stop checking it and drop its stored metrics. */
  monitorDeleted(monitorId: string): void {
    this.forget(monitorId);
    this.enqueue(() => this.deps.store.deleteMonitorData([monitorId]));
  }

  private apply(record: MonitorRecord, now: number, immediate: boolean): void {
    const previous = this.monitors.get(record.id);
    let request: CheckRequest | null = null;
    if (!previous || previous.record.updatedAt !== record.updatedAt || !previous.request) {
      try {
        const secrets = this.deps.decrypt(record);
        request = {
          url: record.url,
          method: record.method,
          headers: secrets.headers,
          body: secrets.body,
          timeoutMs: record.timeoutMs,
          expectedStatus: record.expectedStatus,
          degradedThresholdMs: record.degradedThresholdMs,
          followRedirects: record.followRedirects,
        };
      } catch (err) {
        this.deps.logger.error(
          { err, monitorId: record.id },
          '[monitoring] cannot decrypt monitor',
        );
      }
    } else {
      request = previous.request;
    }
    this.monitors.set(record.id, { record, request });

    const tracker = this.trackerOf(record.id);
    if (!record.enabled) {
      this.scheduler.remove(record.id);
      if (tracker.incidentId) {
        const incidentId = tracker.incidentId;
        const failed = tracker.failedChecks;
        this.enqueue(() =>
          this.deps.store.closeIncident(incidentId, new Date(now).toISOString(), failed),
        );
      }
      this.trackers.set(record.id, { ...initialState('paused'), lastCheck: tracker.lastCheck });
      return;
    }
    if (tracker.status === 'paused') this.trackers.set(record.id, initialState());
    if (request) {
      this.scheduler.upsert(record, now, { immediate });
    } else {
      this.scheduler.remove(record.id);
    }
  }

  private forget(monitorId: string): void {
    this.scheduler.remove(monitorId);
    this.monitors.delete(monitorId);
    this.trackers.delete(monitorId);
    this.accumulators.delete(monitorId);
    this.recent.delete(monitorId);
    this.pendingHours = this.pendingHours.filter((row) => row.monitorId !== monitorId);
  }

  // ─── worker transport ─────────────────────────────────────────────────────

  async lease(request: LeaseRequest): Promise<LeaseResponse> {
    const now = this.now();
    const worker = this.touchWorker(request.workerId, request.region, now);
    const granted = this.scheduler.lease(request.capacity, now);
    const checks = [];
    for (const lease of granted) {
      const cached = this.monitors.get(lease.monitorId);
      if (!cached?.request) {
        this.scheduler.complete(lease.monitorId, lease.leaseId);
        continue;
      }
      checks.push({ ...lease, request: cached.request });
    }
    worker.leased += checks.length;
    return {
      checks,
      pollAfterMs: checks.length ? 0 : this.scheduler.msUntilNextDue(now, MAX_IDLE_POLL_MS),
    };
  }

  async report(request: ReportRequest): Promise<ReportResponse> {
    const worker = this.touchWorker(request.workerId, request.region, this.now());
    let accepted = 0;
    let rejected = 0;
    for (const result of request.results) {
      if (!this.scheduler.complete(result.monitorId, result.leaseId)) {
        rejected++;
        continue;
      }
      accepted++;
      this.record(result.monitorId, result.outcome);
    }
    worker.reported += accepted;
    return { accepted, rejected };
  }

  private touchWorker(workerId: string, region: string | null, now: number): WorkerInfo {
    const worker = this.workers.get(workerId) ?? {
      workerId,
      region,
      lastSeenAt: '',
      leased: 0,
      reported: 0,
    };
    worker.region = region;
    worker.lastSeenAt = new Date(now).toISOString();
    this.workers.set(workerId, worker);
    if (this.workers.size > 500) {
      for (const [id, info] of this.workers) {
        if (now - Date.parse(info.lastSeenAt) > WORKER_ACTIVE_MS) this.workers.delete(id);
      }
    }
    return worker;
  }

  // ─── recording ────────────────────────────────────────────────────────────

  /** Applies one finished check. Exposed for tests; workers go through `report()`. */
  record(monitorId: string, outcome: CheckOutcome): void {
    const cached = this.monitors.get(monitorId);
    if (!cached || !cached.record.enabled) return;

    const recent = this.recent.get(monitorId) ?? [];
    recent.push(outcome);
    if (recent.length > RECENT_CHECKS_PER_MONITOR)
      recent.splice(0, recent.length - RECENT_CHECKS_PER_MONITOR);
    this.recent.set(monitorId, recent);

    const hour = hourStart(outcome.startedAt);
    let accumulator = this.accumulators.get(monitorId);
    if (accumulator && accumulator.hour < hour) {
      this.pendingHours.push(this.toHourRow(monitorId, accumulator));
      accumulator = undefined;
      this.flushSoon();
    }
    if (!accumulator) {
      accumulator = new HourAccumulator(hour);
      this.accumulators.set(monitorId, accumulator);
    }
    // a late result from an hour already closed only feeds the status, not the counters
    if (accumulator.hour === hour) accumulator.add(outcome);

    const tracker = this.trackerOf(monitorId);
    const transition = applyCheck(tracker, outcome, cached.record.confirmations);
    if (transition) this.onTransition(cached.record, tracker, transition);
  }

  private onTransition(record: MonitorRecord, tracker: TrackedState, transition: Transition): void {
    const store = this.deps.store;
    if (transition.kind === 'recovered') {
      this.enqueue(async () => {
        await store.closeIncident(
          transition.closedIncidentId,
          transition.endedAt,
          transition.closedFailedChecks,
        );
        const since = transition.since ? Date.parse(transition.since) : null;
        await this.publish(record, 'monitoring.monitor.recovered', {
          status: 'up',
          previousStatus: transition.previous,
          incidentId: transition.closedIncidentId,
          outcome: transition.outcome,
          durationSeconds:
            since !== null
              ? Math.max(0, Math.round((Date.parse(transition.endedAt) - since) / 1000))
              : null,
        });
      });
      return;
    }

    const incident: IncidentRow = {
      id: this.newId(),
      monitorId: record.id,
      projectId: record.projectId,
      status: transition.status,
      cause: transition.outcome.cause,
      httpStatus: transition.outcome.httpStatus,
      error: transition.outcome.error,
      startedAt: transition.startedAt,
      endedAt: null,
      failedChecks: tracker.failedChecks,
    };
    tracker.incidentId = incident.id;
    const closed = transition.kind === 'changed' ? transition : null;
    this.enqueue(async () => {
      if (closed) {
        await store.closeIncident(
          closed.closedIncidentId,
          closed.startedAt,
          closed.closedFailedChecks,
        );
      }
      await store.insertIncident(incident);
      await this.publish(
        record,
        transition.status === 'down' ? 'monitoring.monitor.down' : 'monitoring.monitor.degraded',
        {
          status: transition.status,
          previousStatus: transition.previous,
          incidentId: incident.id,
          outcome: transition.outcome,
          durationSeconds: null,
        },
      );
    });
  }

  private async publish(
    record: MonitorRecord,
    type:
      'monitoring.monitor.down' | 'monitoring.monitor.degraded' | 'monitoring.monitor.recovered',
    details: {
      status: MonitorStatus;
      previousStatus: MonitorStatus;
      incidentId: string;
      outcome: CheckOutcome;
      durationSeconds: number | null;
    },
  ): Promise<void> {
    await publishAfterWrite(
      this.deps.events,
      this.deps.logger,
      type,
      {
        monitorId: record.id,
        name: record.name,
        url: displayUrl(record.url),
        serviceId: record.serviceId,
        status: details.status as 'up' | 'down' | 'degraded',
        previousStatus: details.previousStatus,
        incidentId: details.incidentId,
        cause: details.outcome.cause,
        httpStatus: details.outcome.httpStatus,
        error: details.outcome.error,
        durationSeconds: details.durationSeconds,
      },
      () => resolveProjectScope(record.projectId, this.deps.projects),
    );
  }

  // ─── persistence ──────────────────────────────────────────────────────────

  /** Saves closed hours and the snapshot of the hour in progress. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      const currentHour = hourStart(this.now());
      for (const [monitorId, accumulator] of [...this.accumulators]) {
        if (accumulator.hour < currentHour) {
          this.pendingHours.push(this.toHourRow(monitorId, accumulator));
          this.accumulators.delete(monitorId);
        }
      }
      const hours = this.pendingHours;
      this.pendingHours = [];
      const current = [...this.accumulators].flatMap(([monitorId, accumulator]) => {
        const cached = this.monitors.get(monitorId);
        if (!cached) return [];
        return [
          {
            monitorId,
            projectId: cached.record.projectId,
            hour: accumulator.hour,
            latencies: accumulator.latencies,
            lastCheck: accumulator.lastCheck,
            ...accumulator.toAggregate(),
          },
        ];
      });
      try {
        await this.writes;
        await this.deps.store.saveHours(hours);
        await this.deps.store.replaceCurrent(current);
        this.deps.logger.debug(
          { hours: hours.length, current: current.length },
          '[monitoring] flushed',
        );
      } catch (err) {
        this.pendingHours = [...hours, ...this.pendingHours];
        this.deps.logger.error({ err }, '[monitoring] flush failed, will retry');
      }
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private flushSoon(): void {
    if (this.soonFlush) return;
    this.soonFlush = setTimeout(() => {
      this.soonFlush = null;
      void this.flush();
    }, 5_000);
    this.soonFlush.unref?.();
  }

  /** Compacts hours past the retention into days and deletes expired data. */
  async compact(): Promise<void> {
    const now = this.now();
    const cutoff = `${dayKey(now - this.deps.config.hourlyRetentionDays * DAY_MS)}T00:00:00.000Z`;
    try {
      const old = await this.deps.store.listHoursBefore(cutoff);
      if (old.length > 0) {
        const days = compactHours(old);
        const existing = await this.deps.store.listDaysByIds(
          days.map((day) => `${day.monitorId}:${day.day}`),
        );
        const merged = days.map((day) => {
          const previous = existing.find(
            (row) => row.monitorId === day.monitorId && row.day === day.day,
          );
          return previous ? { ...day, ...mergeAggregates([previous, day]) } : day;
        });
        await this.deps.store.replaceDays(merged);
        await this.deps.store.deleteHoursBefore(cutoff);
      }
      await this.deps.store.deleteIncidentsEndedBefore(
        new Date(now - this.deps.config.incidentRetentionDays * DAY_MS).toISOString(),
      );
      const known = await this.deps.store.listKnownMonitorIds();
      const orphans = known.filter((id) => !this.monitors.has(id));
      if (orphans.length) await this.deps.store.deleteMonitorData(orphans);
      this.deps.logger.info(
        { compactedHours: old.length, orphans: orphans.length },
        '[monitoring] compaction done',
      );
    } catch (err) {
      this.deps.logger.error({ err }, '[monitoring] compaction failed');
    }
  }

  // ─── reads ────────────────────────────────────────────────────────────────

  status(monitorId: string): MonitorLiveStatus {
    const tracker = this.trackers.get(monitorId);
    const cached = this.monitors.get(monitorId);
    if (!tracker) {
      return {
        status: cached && !cached.record.enabled ? 'paused' : 'pending',
        since: null,
        incidentId: null,
        lastCheck: null,
      };
    }
    return {
      status: tracker.status,
      since: tracker.since,
      incidentId: tracker.incidentId,
      lastCheck: tracker.lastCheck,
    };
  }

  recentChecks(monitorId: string): CheckOutcome[] {
    return [...(this.recent.get(monitorId) ?? [])];
  }

  async incidents(monitorId: string, limit = 50): Promise<IncidentRow[]> {
    const rows = await this.deps.store.listIncidents([monitorId]);
    return rows.slice(0, limit);
  }

  activeWorkers(): WorkerInfo[] {
    const now = this.now();
    return [...this.workers.values()]
      .filter((worker) => now - Date.parse(worker.lastSeenAt) <= WORKER_ACTIVE_MS)
      .sort((a, b) => a.workerId.localeCompare(b.workerId));
  }

  schedulerStats() {
    return this.scheduler.stats(this.now());
  }

  /** Uptime, latency and bars of each monitor, from the stored aggregates plus memory. */
  async stats(records: readonly MonitorRecord[]): Promise<MonitorStats[]> {
    if (records.length === 0) return [];
    const now = this.now();
    const ids = records.map((record) => record.id);
    const [hours, days, incidents] = await Promise.all([
      this.deps.store.listHours(ids, new Date(now - 91 * DAY_MS).toISOString()),
      this.deps.store.listDays(ids, dayKey(now - 91 * DAY_MS)),
      this.deps.store.listIncidents(ids, new Date(now - 91 * DAY_MS).toISOString()),
    ]);
    const allHours = [...hours, ...this.pendingHours];

    return records.map((record) => {
      const monitorHours = allHours.filter((row) => row.monitorId === record.id);
      const monitorDays = days.filter((row) => row.monitorId === record.id);
      const monitorIncidents = incidents.filter((row) => row.monitorId === record.id);
      const accumulator = this.accumulators.get(record.id);
      const current = accumulator ? { hour: accumulator.hour, ...accumulator.toAggregate() } : null;
      const input = {
        incidents: monitorIncidents,
        monitoredFrom: Date.parse(record.createdAt),
        now,
        hours: monitorHours,
        days: monitorDays,
        current,
      };
      const last24 = mergeAggregates([
        ...monitorHours.filter((row) => Date.parse(row.hour) >= now - DAY_MS),
        ...(current ? [current] : []),
      ]);
      const live = this.status(record.id);
      return {
        monitorId: record.id,
        ...live,
        uptime: {
          h24: uptimeRatio(input, now - DAY_MS, now),
          d7: uptimeRatio(input, now - 7 * DAY_MS, now),
          d30: uptimeRatio(input, now - 30 * DAY_MS, now),
          d90: uptimeRatio(input, now - 90 * DAY_MS, now),
        },
        latency24h: { avg: last24.latencyAvg, p95: last24.latencyP95, max: last24.latencyMax },
        hourlyBars: buildBars(input, 'hour', 24),
        dailyBars: buildBars(input, 'day', 90),
        openIncident: live.incidentId
          ? (monitorIncidents.find((row) => row.id === live.incidentId) ?? null)
          : null,
      };
    });
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private trackerOf(monitorId: string): TrackedState {
    let tracker = this.trackers.get(monitorId);
    if (!tracker) {
      tracker = initialState();
      this.trackers.set(monitorId, tracker);
    }
    return tracker;
  }

  private toHourRow(monitorId: string, accumulator: HourAccumulator): HourRow {
    return {
      monitorId,
      projectId: this.monitors.get(monitorId)?.record.projectId ?? '',
      hour: accumulator.hour,
      ...accumulator.toAggregate(),
    };
  }

  /** Writes run one after another; a failed write is logged and does not block the next ones. */
  private enqueue(task: () => Promise<void>): void {
    this.writes = this.writes.then(task).catch((err) => {
      this.deps.logger.error({ err }, '[monitoring] write failed');
    });
  }

  /** Waits for the writes queued so far (tests). */
  settle(): Promise<void> {
    return this.writes;
  }

  private every(ms: number, task: () => Promise<void>): void {
    const timer = setInterval(() => {
      void task().catch((err) =>
        this.deps.logger.error({ err }, '[monitoring] periodic task failed'),
      );
    }, ms);
    timer.unref?.();
    this.timers.push(timer);
  }
}
