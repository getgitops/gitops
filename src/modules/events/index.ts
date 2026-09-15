import { EventBusService } from './application/event-bus.service';
import {
  DEFAULT_EVENT_TTL_MS,
  DEFAULT_SWEEP_INTERVAL_MS,
  InMemoryEventStore,
} from './infrastructure/store/in-memory-event-store';

const eventStore = new InMemoryEventStore(DEFAULT_EVENT_TTL_MS, DEFAULT_SWEEP_INTERVAL_MS);
eventStore.startSweeper();

export const eventBus = new EventBusService(eventStore);

export { eventStore, EventBusService, InMemoryEventStore, DEFAULT_EVENT_TTL_MS };
export { DomainEvent } from './domain/domain-event';
export type { DomainEventClass, DomainEventJson, DomainEventMetadata } from './domain/domain-event';
export type {
  EventStoreMetrics,
  EventNameMetrics,
  StoredEvent,
  StoredEventStatus,
} from './domain/stored-event';
export type { EventHandler, EventSubscriber } from './application/event-bus.service';
export {
  CodeReportAnalysisCompletedEvent,
  type CodeReportAnalysisCompletedPayload,
} from './domain/events/code-report-analysis-completed.event';
