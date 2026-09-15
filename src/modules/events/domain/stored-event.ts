import type { DomainEventJson } from './domain-event';

export type StoredEventStatus = 'pending' | 'processed' | 'failed' | 'unsubscribed';

export interface StoredEvent {
  id: string;
  name: string;
  occurredAt: string;
  expiresAt: string;
  status: StoredEventStatus;
  subscribers: number;
  attempts: number;
  error: string | null;
  processedAt: string | null;
  event: DomainEventJson;
}

export interface EventNameMetrics {
  emitted: number;
  processed: number;
  failed: number;
  withoutSubscribers: number;
  expired: number;
}

export interface EventStoreMetrics {
  totalEmitted: number;
  totalProcessed: number;
  totalFailed: number;
  totalWithoutSubscribers: number;
  totalExpired: number;
  pending: number;
  stored: number;
  ttlMs: number;
  byEvent: Array<{ name: string } & EventNameMetrics>;
}
