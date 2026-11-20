import type { Logger } from 'pino';
import { createLogger } from '#lib/server/logger';
import { getCurrentActor, type RequestActor } from '#lib/server/request-context';
import type {
  AnyEventEnvelope,
  DomainEventMap,
  EventActor,
  EventEnvelope,
  EventHandler,
  EventTypeOf,
  PublishOptions,
  Unsubscribe,
} from './types';

export interface EventBus<M extends object = DomainEventMap> {
  /**
   * Publishes `type` and returns its envelope immediately; handlers run asynchronously.
   * Call it only after the GitDB write it describes has succeeded.
   */
  publish<K extends EventTypeOf<M>>(
    type: K,
    payload: M[K],
    opts?: PublishOptions,
  ): EventEnvelope<M, K>;

  /** Subscribes to one event type, or to every type with `'*'`. Returns the unsubscribe function. */
  subscribe<K extends EventTypeOf<M>>(
    type: K,
    handler: EventHandler<EventEnvelope<M, K>>,
  ): Unsubscribe;
  subscribe(type: '*', handler: EventHandler<AnyEventEnvelope<M>>): Unsubscribe;

  /** Resolves once every handler scheduled so far (and any they schedule) has finished. */
  drain(): Promise<void>;
}

type Subscription<M extends object> = {
  type: EventTypeOf<M> | '*';
  handler: EventHandler<AnyEventEnvelope<M>>;
  active: boolean;
  /** Per-subscriber queue: keeps delivery in publish order even for async handlers. */
  tail: Promise<void>;
};

export type InProcessEventBusOptions = {
  logger?: Pick<Logger, 'error'>;
  resolveActor?: () => RequestActor | null;
  now?: () => Date;
  generateId?: () => string;
};

/** Maps the request context onto an event actor; no context means a system event. */
export function actorFromRequest(actor: RequestActor | null): EventActor {
  if (actor?.apiKeyId) {
    return { kind: 'api_key', apiKeyId: actor.apiKeyId, projectId: actor.apiKeyProjectId ?? null };
  }
  if (actor?.userId) return { kind: 'user', userId: actor.userId };
  return { kind: 'system' };
}

/**
 * In-process, at-most-once event bus. Events are not persisted and never leave the process.
 *
 * - `publish()` never waits for handlers and never throws because of them.
 * - Each subscriber receives events in publish order; a slow subscriber does not delay others.
 * - A failing handler is logged with the event `type` and `id` and does not affect other handlers
 *   or later events.
 */
export class InProcessEventBus<M extends object = DomainEventMap> implements EventBus<M> {
  private readonly subscriptions = new Set<Subscription<M>>();
  private readonly log: Pick<Logger, 'error'>;
  private readonly resolveActor: () => RequestActor | null;
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(options: InProcessEventBusOptions = {}) {
    this.log = options.logger ?? createLogger('events');
    this.resolveActor = options.resolveActor ?? getCurrentActor;
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
  }

  publish<K extends EventTypeOf<M>>(
    type: K,
    payload: M[K],
    opts: PublishOptions = {},
  ): EventEnvelope<M, K> {
    const event: EventEnvelope<M, K> = {
      id: this.generateId(),
      type,
      occurredAt: this.now().toISOString(),
      actor: opts.actor ?? actorFromRequest(this.resolveActor()),
      scope: { ...opts.scope },
      payload,
    };

    this.dispatch(event as unknown as AnyEventEnvelope<M>);
    return event;
  }

  subscribe<K extends EventTypeOf<M>>(
    type: K,
    handler: EventHandler<EventEnvelope<M, K>>,
  ): Unsubscribe;
  subscribe(type: '*', handler: EventHandler<AnyEventEnvelope<M>>): Unsubscribe;
  subscribe(
    type: EventTypeOf<M> | '*',
    handler: EventHandler<AnyEventEnvelope<M>> | EventHandler<never>,
  ): Unsubscribe {
    const subscription: Subscription<M> = {
      type,
      handler: handler as EventHandler<AnyEventEnvelope<M>>,
      active: true,
      tail: Promise.resolve(),
    };
    this.subscriptions.add(subscription);

    return () => {
      subscription.active = false;
      this.subscriptions.delete(subscription);
    };
  }

  async drain(): Promise<void> {
    // handlers may publish more events while we wait: loop until every queue is settled
    for (;;) {
      const tails = [...this.subscriptions].map((s) => s.tail);
      await Promise.all(tails);
      const settled = [...this.subscriptions].every((s, i) => s.tail === tails[i]);
      if (settled && tails.length === this.subscriptions.size) return;
    }
  }

  private dispatch(event: AnyEventEnvelope<M>): void {
    for (const subscription of this.subscriptions) {
      if (subscription.type !== '*' && subscription.type !== event.type) continue;
      // `.then` defers to a microtask, so publish() returns before any handler runs
      subscription.tail = subscription.tail.then(() => this.run(subscription, event));
    }
  }

  private async run(subscription: Subscription<M>, event: AnyEventEnvelope<M>): Promise<void> {
    if (!subscription.active) return;
    try {
      await subscription.handler(event);
    } catch (error) {
      this.log.error(
        { err: error, eventType: event.type, eventId: event.id, subscribedTo: subscription.type },
        `[events] handler failed for ${event.type} (${event.id})`,
      );
    }
  }
}
