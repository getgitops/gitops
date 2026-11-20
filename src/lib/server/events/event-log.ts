import type { EventBus } from './event-bus';
import type { AnyDomainEvent, EventType, Unsubscribe } from './types';

export type EventAck = {
  userId: string;
  username: string;
  /** ISO 8601 */
  at: string;
};

export type LoggedEvent = {
  event: AnyDomainEvent;
  ack: EventAck | null;
};

export type EventLogQuery = {
  organizationId: string;
  types?: readonly EventType[];
  /** `true`: only acknowledged, `false`: only pending, omitted: both. */
  acked?: boolean;
  limit?: number;
};

export type InMemoryEventLogOptions = {
  /** How long an event is kept, in milliseconds. */
  ttlMs: number;
  /** Upper bound on retained events; the oldest are dropped first. */
  maxEvents?: number;
  now?: () => number;
};

export const DEFAULT_MAX_LOGGED_EVENTS = 10_000;

/**
 * Recent domain events, kept in memory for the organization events page, with a shared
 * acknowledgement per event (who and when).
 *
 * Per process and not persisted: a restart empties it and each replica keeps its own log.
 * Events older than `ttlMs` are dropped, and the log never holds more than `maxEvents`.
 */
export class InMemoryEventLog {
  // insertion order is publish order, so the oldest entries are always first
  private readonly entries = new Map<string, LoggedEvent>();
  private readonly ttlMs: number;
  private readonly maxEvents: number;
  private readonly now: () => number;

  constructor(options: InMemoryEventLogOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEvents = options.maxEvents ?? DEFAULT_MAX_LOGGED_EVENTS;
    this.now = options.now ?? Date.now;
  }

  /** Records every event published on `bus` from now on. */
  attach(bus: Pick<EventBus, 'subscribe'>): Unsubscribe {
    return bus.subscribe('*', (event) => this.record(event));
  }

  record(event: AnyDomainEvent): void {
    this.entries.set(event.id, { event, ack: null });
    this.prune();
    while (this.entries.size > this.maxEvents) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /** Events of an organization (including its projects), newest first. */
  list(query: EventLogQuery): LoggedEvent[] {
    this.prune();
    const types = query.types ? new Set<string>(query.types) : null;
    const result: LoggedEvent[] = [];

    for (const entry of [...this.entries.values()].reverse()) {
      if (entry.event.scope.organizationId !== query.organizationId) continue;
      if (types && !types.has(entry.event.type)) continue;
      if (query.acked !== undefined && (entry.ack !== null) !== query.acked) continue;
      result.push(entry);
      if (query.limit !== undefined && result.length >= query.limit) break;
    }
    return result;
  }

  get(id: string): LoggedEvent | null {
    this.prune();
    return this.entries.get(id) ?? null;
  }

  /** Acknowledges an event. Idempotent: the first acknowledgement is kept. */
  ack(id: string, by: { userId: string; username: string }): LoggedEvent | null {
    const entry = this.get(id);
    if (!entry) return null;
    entry.ack ??= { ...by, at: new Date(this.now()).toISOString() };
    return entry;
  }

  /** Drops expired events. */
  prune(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, entry] of this.entries) {
      // entries are in publish order: stop at the first one that is still fresh
      if (Date.parse(entry.event.occurredAt) >= cutoff) break;
      this.entries.delete(id);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
