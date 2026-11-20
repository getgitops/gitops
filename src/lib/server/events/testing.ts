import { InProcessEventBus, type InProcessEventBusOptions } from './event-bus';
import type {
  AnyEventEnvelope,
  DomainEventMap,
  EventEnvelope,
  EventTypeOf,
  PublishOptions,
} from './types';

/**
 * Event bus for unit tests: records every published event so services can be asserted on what
 * they emit. Subscribers still work, so it can also wire a subscriber under test.
 *
 * ```ts
 * const events = new RecordingEventBus();
 * const service = new VaultService(repository, events);
 * await service.createSecret(input);
 * expect(events.ofType('vault.secret.created')).toHaveLength(1);
 * ```
 */
export class RecordingEventBus<M extends object = DomainEventMap> extends InProcessEventBus<M> {
  readonly events: AnyEventEnvelope<M>[] = [];

  constructor(options: InProcessEventBusOptions = {}) {
    super({ logger: { error: () => {} }, ...options });
  }

  override publish<K extends EventTypeOf<M>>(
    type: K,
    payload: M[K],
    opts?: PublishOptions,
  ): EventEnvelope<M, K> {
    const event = super.publish(type, payload, opts);
    this.events.push(event as unknown as AnyEventEnvelope<M>);
    return event;
  }

  /** Recorded events of one type, in publish order. */
  ofType<K extends EventTypeOf<M>>(type: K): EventEnvelope<M, K>[] {
    return this.events.filter((event) => event.type === type) as unknown as EventEnvelope<M, K>[];
  }

  /** Event types recorded so far, in publish order. */
  types(): EventTypeOf<M>[] {
    return this.events.map((event) => event.type);
  }

  clear(): void {
    this.events.length = 0;
  }
}
