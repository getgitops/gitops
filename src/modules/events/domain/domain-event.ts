import crypto from 'crypto';

export interface DomainEventMetadata {
  actorId?: string | null;
  organizationId?: string | null;
  correlationId?: string | null;
}

export interface DomainEventJson<TPayload = unknown> {
  id: string;
  name: string;
  occurredAt: string;
  payload: TPayload;
  metadata: DomainEventMetadata;
}

/**
 * Base class for every event in the local event store. Each concrete event declares its own
 * `eventName` static so subscribers can reference the class instead of a magic string.
 */
export abstract class DomainEvent<TPayload = unknown> {
  readonly id: string;
  readonly occurredAt: string;
  readonly payload: TPayload;
  readonly metadata: DomainEventMetadata;

  constructor(payload: TPayload, metadata: DomainEventMetadata = {}) {
    this.id = crypto.randomUUID();
    this.occurredAt = new Date().toISOString();
    this.payload = payload;
    this.metadata = metadata;
  }

  abstract get name(): string;

  toJson(): DomainEventJson<TPayload> {
    return {
      id: this.id,
      name: this.name,
      occurredAt: this.occurredAt,
      payload: this.payload,
      metadata: this.metadata,
    };
  }
}

/**
 * Shape used to subscribe by class (`bus.on(MyEvent, handler)`); `prototype` carries the instance
 * type so handlers are typed without exposing the constructor signature.
 */
export interface DomainEventClass<TEvent extends DomainEvent = DomainEvent> {
  readonly eventName: string;
  readonly prototype: TEvent;
}
