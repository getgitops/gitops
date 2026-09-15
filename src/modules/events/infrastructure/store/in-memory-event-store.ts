import { createLogger } from '$lib/server/logger';
import type { DomainEvent } from '../../domain/domain-event';
import type {
  EventNameMetrics,
  EventStoreMetrics,
  StoredEvent,
  StoredEventStatus,
} from '../../domain/stored-event';

const log = createLogger('events-store');

export const DEFAULT_EVENT_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_SWEEP_INTERVAL_MS = 30 * 1000;

function emptyMetrics(): EventNameMetrics {
  return { emitted: 0, processed: 0, failed: 0, withoutSubscribers: 0, expired: 0 };
}

/**
 * Local event sourcing store: keeps every emitted event in memory for `ttlMs`; records nobody
 * consumed within that window are dropped by the sweeper.
 */
export class InMemoryEventStore {
  private readonly records = new Map<string, StoredEvent>();
  private readonly metrics = new Map<string, EventNameMetrics>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    public readonly ttlMs: number = DEFAULT_EVENT_TTL_MS,
    private readonly sweepIntervalMs: number = DEFAULT_SWEEP_INTERVAL_MS,
  ) {}

  startSweeper() {
    if (this.timer) return;
    this.timer = setInterval(() => this.sweep(), this.sweepIntervalMs);
    this.timer.unref?.();
    log.info({ ttlMs: this.ttlMs, sweepIntervalMs: this.sweepIntervalMs }, 'event store sweeper started');
  }

  stopSweeper() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    log.info('event store sweeper stopped');
  }

  append(event: DomainEvent, subscribers: number): StoredEvent {
    const now = Date.now();
    const record: StoredEvent = {
      id: event.id,
      name: event.name,
      occurredAt: event.occurredAt,
      expiresAt: new Date(now + this.ttlMs).toISOString(),
      status: subscribers > 0 ? 'pending' : 'unsubscribed',
      subscribers,
      attempts: 0,
      error: null,
      processedAt: null,
      event: event.toJson(),
    };

    this.records.set(record.id, record);
    this.bump(event.name, 'emitted');
    if (subscribers === 0) {
      this.bump(event.name, 'withoutSubscribers');
    }

    return record;
  }

  markProcessed(id: string) {
    const record = this.records.get(id);
    if (!record) return;
    record.status = 'processed';
    record.attempts += 1;
    record.processedAt = new Date().toISOString();
    record.error = null;
    this.bump(record.name, 'processed');
  }

  markFailed(id: string, error: string) {
    const record = this.records.get(id);
    if (!record) return;
    record.status = 'failed';
    record.attempts += 1;
    record.error = error;
    this.bump(record.name, 'failed');
  }

  get(id: string): StoredEvent | null {
    return this.records.get(id) ?? null;
  }

  list(filter?: { status?: StoredEventStatus; name?: string }): StoredEvent[] {
    return [...this.records.values()]
      .filter((record) => (filter?.status ? record.status === filter.status : true))
      .filter((record) => (filter?.name ? record.name === filter.name : true))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }

  /** Removes every record whose TTL expired; records nobody processed are counted as expired. */
  sweep(now: number = Date.now()): number {
    let removed = 0;

    for (const record of this.records.values()) {
      if (new Date(record.expiresAt).getTime() > now) continue;

      this.records.delete(record.id);
      removed += 1;

      if (record.status === 'pending' || record.status === 'unsubscribed') {
        this.bump(record.name, 'expired');
        log.warn(
          { eventId: record.id, event: record.name, status: record.status, ttlMs: this.ttlMs },
          'event discarded: nobody consumed it before its lifetime expired',
        );
      }
    }

    if (removed > 0) {
      log.debug({ removed, stored: this.records.size }, 'event store swept');
    }

    return removed;
  }

  getMetrics(): EventStoreMetrics {
    const totals = [...this.metrics.values()].reduce<EventNameMetrics>((accumulator, entry) => {
      accumulator.emitted += entry.emitted;
      accumulator.processed += entry.processed;
      accumulator.failed += entry.failed;
      accumulator.withoutSubscribers += entry.withoutSubscribers;
      accumulator.expired += entry.expired;
      return accumulator;
    }, emptyMetrics());

    return {
      totalEmitted: totals.emitted,
      totalProcessed: totals.processed,
      totalFailed: totals.failed,
      totalWithoutSubscribers: totals.withoutSubscribers,
      totalExpired: totals.expired,
      pending: this.list({ status: 'pending' }).length,
      stored: this.records.size,
      ttlMs: this.ttlMs,
      byEvent: [...this.metrics.entries()]
        .map(([name, entry]) => ({ name, ...entry }))
        .sort((left, right) => right.emitted - left.emitted),
    };
  }

  reset() {
    this.records.clear();
    this.metrics.clear();
  }

  private bump(name: string, key: keyof EventNameMetrics) {
    const entry = this.metrics.get(name) ?? emptyMetrics();
    entry[key] += 1;
    this.metrics.set(name, entry);
  }
}
