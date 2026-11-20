import type { Logger } from 'pino';
import type { EventBus } from './event-bus';
import type { DomainEventMap, EventScope, EventType } from './types';

export type EventPublisher = Pick<EventBus, 'publish'>;

/**
 * Publishes an event describing a write that already succeeded. Resolving the scope or publishing
 * never throws back into the caller: a failure is logged and the request carries on.
 */
export async function publishAfterWrite<K extends EventType>(
  events: EventPublisher | undefined,
  log: Pick<Logger, 'error'>,
  type: K,
  payload: DomainEventMap[K],
  scope: EventScope | (() => Promise<EventScope>),
): Promise<void> {
  if (!events) return;
  try {
    const resolved = typeof scope === 'function' ? await scope() : scope;
    events.publish(type, payload, { scope: resolved });
  } catch (error) {
    log.error({ err: error, eventType: type }, `[events] failed to publish ${type}`);
  }
}
