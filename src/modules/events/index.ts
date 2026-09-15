import { createLogger } from '$lib/server/logger';
import { EventBusService } from './application/event-bus.service';
import {
  DEFAULT_EVENT_TTL_MS,
  DEFAULT_SWEEP_INTERVAL_MS,
  InMemoryEventStore,
} from './infrastructure/store/in-memory-event-store';
import { CodeReportAnalysisCompletedEvent } from './domain/events/code-report-analysis-completed.event';
import { CodeReportAnalysisStartedEvent } from './domain/events/code-report-analysis-started.event';
import { CodeReportAnalysisFailedEvent } from './domain/events/code-report-analysis-failed.event';
import { OrganizationCreatedEvent } from './domain/events/organization-created.event';
import { OrganizationUpdatedEvent } from './domain/events/organization-updated.event';
import { OrganizationDeletedEvent } from './domain/events/organization-deleted.event';
import { OrganizationUserAssignedEvent } from './domain/events/organization-user-assigned.event';
import { ProjectCreatedEvent } from './domain/events/project-created.event';
import { ProjectDeletedEvent } from './domain/events/project-deleted.event';
import { ProjectServerKeyCreatedEvent } from './domain/events/project-server-key-created.event';
import { ProjectServerKeyRegeneratedEvent } from './domain/events/project-server-key-regenerated.event';
import { ProjectServerKeyDeletedEvent } from './domain/events/project-server-key-deleted.event';
import { UserCreatedEvent } from './domain/events/user-created.event';
import { UserDeletedEvent } from './domain/events/user-deleted.event';
import { VaultEnvironmentCreatedEvent } from './domain/events/vault-environment-created.event';
import { VaultEnvironmentUpdatedEvent } from './domain/events/vault-environment-updated.event';
import { VaultEnvironmentDeletedEvent } from './domain/events/vault-environment-deleted.event';

const log = createLogger('events');

const eventStore = new InMemoryEventStore(DEFAULT_EVENT_TTL_MS, DEFAULT_SWEEP_INTERVAL_MS);

export const eventBus = new EventBusService(eventStore);

/** Every event the platform can emit; kept here so the catalog is visible at startup. */
export const EVENT_CATALOG = [
  ProjectCreatedEvent,
  ProjectDeletedEvent,
  ProjectServerKeyCreatedEvent,
  ProjectServerKeyRegeneratedEvent,
  ProjectServerKeyDeletedEvent,
  CodeReportAnalysisStartedEvent,
  CodeReportAnalysisCompletedEvent,
  CodeReportAnalysisFailedEvent,
  VaultEnvironmentCreatedEvent,
  VaultEnvironmentUpdatedEvent,
  VaultEnvironmentDeletedEvent,
  OrganizationCreatedEvent,
  OrganizationUpdatedEvent,
  OrganizationDeletedEvent,
  OrganizationUserAssignedEvent,
  UserCreatedEvent,
  UserDeletedEvent,
];

let started = false;

/** Starts the TTL sweeper and attaches the built-in subscribers. Runs once per process. */
export function startEvents() {
  if (started) return;
  started = true;

  eventStore.startSweeper();

  log.info(
    {
      ttlMs: DEFAULT_EVENT_TTL_MS,
      sweepIntervalMs: DEFAULT_SWEEP_INTERVAL_MS,
      events: EVENT_CATALOG.map((event) => event.eventName),
    },
    'event bus started',
  );
}

export function stopEvents() {
  if (!started) return;
  started = false;
  eventStore.stopSweeper();
  log.info('event bus stopped');
}

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
export {
  CodeReportAnalysisStartedEvent,
  type CodeReportAnalysisStartedPayload,
} from './domain/events/code-report-analysis-started.event';
export {
  CodeReportAnalysisFailedEvent,
  type CodeReportAnalysisFailedPayload,
} from './domain/events/code-report-analysis-failed.event';
export {
  ProjectCreatedEvent,
  type ProjectCreatedPayload,
} from './domain/events/project-created.event';
export {
  ProjectDeletedEvent,
  type ProjectDeletedPayload,
} from './domain/events/project-deleted.event';
export {
  ProjectServerKeyCreatedEvent,
  type ProjectServerKeyCreatedPayload,
} from './domain/events/project-server-key-created.event';
export {
  ProjectServerKeyRegeneratedEvent,
  type ProjectServerKeyRegeneratedPayload,
} from './domain/events/project-server-key-regenerated.event';
export {
  ProjectServerKeyDeletedEvent,
  type ProjectServerKeyDeletedPayload,
} from './domain/events/project-server-key-deleted.event';
export {
  VaultEnvironmentCreatedEvent,
  type VaultEnvironmentCreatedPayload,
} from './domain/events/vault-environment-created.event';
export {
  VaultEnvironmentUpdatedEvent,
  type VaultEnvironmentUpdatedPayload,
} from './domain/events/vault-environment-updated.event';
export {
  VaultEnvironmentDeletedEvent,
  type VaultEnvironmentDeletedPayload,
} from './domain/events/vault-environment-deleted.event';
export {
  OrganizationCreatedEvent,
  type OrganizationCreatedPayload,
} from './domain/events/organization-created.event';
export {
  OrganizationUpdatedEvent,
  type OrganizationUpdatedPayload,
} from './domain/events/organization-updated.event';
export {
  OrganizationDeletedEvent,
  type OrganizationDeletedPayload,
} from './domain/events/organization-deleted.event';
export {
  OrganizationUserAssignedEvent,
  type OrganizationUserAssignedPayload,
} from './domain/events/organization-user-assigned.event';
export { UserCreatedEvent, type UserCreatedPayload } from './domain/events/user-created.event';
export { UserDeletedEvent, type UserDeletedPayload } from './domain/events/user-deleted.event';
