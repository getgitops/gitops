import { createLogger } from '$lib/server/logger';
import type { DomainEvent, DomainEventClass } from '../domain/domain-event';
import type { EventStoreMetrics, StoredEvent } from '../domain/stored-event';
import type { InMemoryEventStore } from '../infrastructure/store/in-memory-event-store';

const log = createLogger('events-bus');

export type EventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent,
) => void | Promise<void>;

/** Long-lived listener that can be plugged in/out with `attach()` / `detach()`. */
export interface EventSubscriber {
  readonly name: string;
  subscribedTo(): DomainEventClass[];
  handle(event: DomainEvent): void | Promise<void>;
}

interface HandlerEntry {
  id: string;
  name: string;
  handler: EventHandler;
}

export class EventBusService {
  private readonly handlers = new Map<string, Set<HandlerEntry>>();
  private readonly attached = new Map<EventSubscriber, HandlerEntry[]>();
  private sequence = 0;

  constructor(private readonly store: InMemoryEventStore) {}

  /** Registers a handler for an event class. Returns the function that unregisters it. */
  on<TEvent extends DomainEvent>(
    eventClass: DomainEventClass<TEvent>,
    handler: EventHandler<TEvent>,
    options: { name?: string } = {},
  ): () => void {
    const entry: HandlerEntry = {
      id: `handler-${(this.sequence += 1)}`,
      name: options.name ?? handler.name ?? 'anonymous',
      handler: handler as EventHandler,
    };

    this.register(eventClass.eventName, entry);
    log.info(
      { event: eventClass.eventName, handler: entry.name, handlers: this.countHandlers(eventClass.eventName) },
      'event handler registered',
    );

    return () => this.unregister(eventClass.eventName, entry);
  }

  /** Removes a handler previously registered with `on()`. */
  off<TEvent extends DomainEvent>(
    eventClass: DomainEventClass<TEvent>,
    handler: EventHandler<TEvent>,
  ): void {
    const entries = this.handlers.get(eventClass.eventName);
    if (!entries) return;

    for (const entry of entries) {
      if (entry.handler === (handler as EventHandler)) {
        this.unregister(eventClass.eventName, entry);
      }
    }
  }

  /** Plugs a subscriber into every event it declares in `subscribedTo()`. */
  attach(subscriber: EventSubscriber): void {
    if (this.attached.has(subscriber)) {
      log.warn({ subscriber: subscriber.name }, 'subscriber already attached');
      return;
    }

    const entries = subscriber.subscribedTo().map((eventClass) => {
      const entry: HandlerEntry = {
        id: `subscriber-${(this.sequence += 1)}`,
        name: subscriber.name,
        handler: (event) => subscriber.handle(event),
      };
      this.register(eventClass.eventName, entry);
      return entry;
    });

    this.attached.set(subscriber, entries);
    log.info(
      { subscriber: subscriber.name, events: subscriber.subscribedTo().map((item) => item.eventName) },
      'subscriber attached',
    );
  }

  /** Unplugs a subscriber from every event it was attached to. */
  detach(subscriber: EventSubscriber): void {
    const entries = this.attached.get(subscriber);
    if (!entries) {
      log.warn({ subscriber: subscriber.name }, 'subscriber was not attached');
      return;
    }

    for (const eventClass of subscriber.subscribedTo()) {
      for (const entry of entries) {
        this.unregister(eventClass.eventName, entry);
      }
    }

    this.attached.delete(subscriber);
    log.info({ subscriber: subscriber.name }, 'subscriber detached');
  }

  /** Stores the event and delivers it to every handler; failures never break the emitter. */
  async emit(event: DomainEvent): Promise<StoredEvent> {
    const entries = [...(this.handlers.get(event.name) ?? [])];
    const record = this.store.append(event, entries.length);

    if (entries.length === 0) {
      log.warn(
        { eventId: event.id, event: event.name, ttlMs: this.store.ttlMs },
        'event emitted without subscribers',
      );
      return record;
    }

    log.info(
      { eventId: event.id, event: event.name, subscribers: entries.length },
      'event emitted',
    );

    const results = await Promise.allSettled(
      entries.map(async (entry) => {
        try {
          await entry.handler(event);
        } catch (error) {
          log.error(
            error instanceof Error ? error : new Error(String(error)),
            `event handler "${entry.name}" failed for ${event.name}`,
          );
          throw error;
        }
      }),
    );

    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length > 0) {
      const reason = failed[0].status === 'rejected' ? failed[0].reason : null;
      this.store.markFailed(
        event.id,
        reason instanceof Error ? reason.message : String(reason ?? 'unknown error'),
      );
      return this.store.get(event.id) ?? record;
    }

    this.store.markProcessed(event.id);
    log.debug({ eventId: event.id, event: event.name }, 'event processed');
    return this.store.get(event.id) ?? record;
  }

  listEvents(filter?: Parameters<InMemoryEventStore['list']>[0]): StoredEvent[] {
    return this.store.list(filter);
  }

  getMetrics(): EventStoreMetrics {
    return this.store.getMetrics();
  }

  /** Handler count per event name, used by the monitoring view. */
  getSubscriptions(): Array<{ event: string; handlers: string[] }> {
    return [...this.handlers.entries()].map(([event, entries]) => ({
      event,
      handlers: [...entries].map((entry) => entry.name),
    }));
  }

  private register(eventName: string, entry: HandlerEntry) {
    const entries = this.handlers.get(eventName) ?? new Set<HandlerEntry>();
    entries.add(entry);
    this.handlers.set(eventName, entries);
  }

  private unregister(eventName: string, entry: HandlerEntry) {
    const entries = this.handlers.get(eventName);
    if (!entries?.delete(entry)) return;
    if (entries.size === 0) this.handlers.delete(eventName);
    log.info({ event: eventName, handler: entry.name }, 'event handler removed');
  }

  private countHandlers(eventName: string) {
    return this.handlers.get(eventName)?.size ?? 0;
  }
}
