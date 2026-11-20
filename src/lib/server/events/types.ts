import type { DomainEventMap } from '#lib/events/domain-events';

/**
 * Domain event types. See `docs/adr/0001-event-bus-and-alerts.md` for the design and rules.
 *
 * Event names follow `<module>.<resource>.<action>` in snake_case, with the action as a past
 * participle (`code_report.analysis.completed`, `vault.secret.created`, `access.granted`).
 */

/** Who caused the event. Resolved from the request context when the publisher does not pass one. */
export type EventActor =
  | { kind: 'user'; userId: string }
  | { kind: 'api_key'; apiKeyId: string; projectId: string | null }
  | { kind: 'system' };

/** Where the event happened; the alert engine matches alerts by this scope. */
export type EventScope = {
  organizationId?: string | null;
  projectId?: string | null;
};

/**
 * Event type → payload. Declared in `#lib/events/domain-events` so the alert builder UI can share
 * it without importing server code.
 */
export type { DomainEventMap };

/** Event names of an event map. */
export type EventTypeOf<M extends object> = Extract<keyof M, string>;

/** Envelope published on the bus for event `K` of map `M`. */
export type EventEnvelope<M extends object, K extends EventTypeOf<M>> = {
  /** `crypto.randomUUID()` */
  id: string;
  type: K;
  /** ISO 8601 */
  occurredAt: string;
  actor: EventActor;
  scope: EventScope;
  payload: M[K];
};

/** Discriminated union of every envelope of map `M` (what a `'*'` subscriber receives). */
export type AnyEventEnvelope<M extends object> = {
  [K in EventTypeOf<M>]: EventEnvelope<M, K>;
}[EventTypeOf<M>];

export type EventType = EventTypeOf<DomainEventMap>;

export type DomainEvent<K extends EventType = EventType> = EventEnvelope<DomainEventMap, K>;

export type AnyDomainEvent = AnyEventEnvelope<DomainEventMap>;

export type PublishOptions = {
  scope?: EventScope;
  /** Overrides the actor resolved from the request context (e.g. background jobs). */
  actor?: EventActor;
};

export type EventHandler<E> = (event: E) => void | Promise<void>;

export type Unsubscribe = () => void;
