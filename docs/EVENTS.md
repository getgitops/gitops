# Events

Local event sourcing for GitOps. Modules emit domain events when something relevant happens; any
part of the platform can subscribe to react (notifications, webhooks, integrations) without the
emitter knowing about the consumer.

Everything runs **in-process and in memory**: there is no broker and no persistence. Events are kept
in a local store for **5 minutes**; whatever is not consumed in that window is dropped and counted
as expired.

## Module layout

```text
src/modules/events/
  domain/
    domain-event.ts                     DomainEvent base class + DomainEventClass type
    stored-event.ts                     StoredEvent record and metrics types
    events/<event-name>.event.ts        one class per event
  application/
    event-bus.service.ts                emit / on / off / attach / detach + metrics
  infrastructure/
    store/in-memory-event-store.ts      5 min TTL store + sweeper
  index.ts                              eventBus singleton, startEvents(), EVENT_CATALOG
```

## Lifecycle

1. `startEvents()` runs once per process from `src/hooks.server.ts`, right **after** `startGitDb()`
   (events carry data that comes from the database, so the DB must be up first). It starts the
   sweeper and logs the catalog.
2. A service calls `eventBus.emit(new SomeEvent({...}))` after the write succeeds.
3. The bus stores the event (`pending` if it has subscribers, `unsubscribed` if not) and delivers it
   to every handler with `Promise.allSettled`; a failing handler never breaks the emitter.
4. The record becomes `processed` or `failed` and stays in the store until its TTL.
5. Every 30 s the sweeper deletes expired records. Records still `pending`/`unsubscribed` are counted
   as `expired` and logged with a warning.

Event statuses: `pending` · `processed` · `failed` · `unsubscribed`.

## API

```typescript
import { eventBus, ProjectCreatedEvent, type EventSubscriber } from '$modules/events';

// emit
await eventBus.emit(new ProjectCreatedEvent({ projectId, organizationId, name, slug }));

// subscribe to a single event; returns the unsubscribe function
const off = eventBus.on(ProjectCreatedEvent, async (event) => {
  console.log(event.payload.projectId);
});
off();

// or remove it explicitly
eventBus.off(ProjectCreatedEvent, handler);

// long-lived subscriber listening to several events
const notifier: EventSubscriber = {
  name: 'slack-notifier',
  subscribedTo: () => [ProjectCreatedEvent],
  handle: async (event) => {
    /* ... */
  },
};
eventBus.attach(notifier);
eventBus.detach(notifier);

// introspection (used by the monitoring view)
eventBus.getMetrics();
eventBus.getSubscriptions();
eventBus.listEvents({ status: 'pending' });
```

Every event instance carries `id`, `name`, `occurredAt`, `payload` and optional `metadata`
(`actorId`, `organizationId`, `correlationId`).

## Event catalog

All classes live in `src/modules/events/domain/events/` and are registered in `EVENT_CATALOG`
(`src/modules/events/index.ts`).

| Event name                       | Class                              | Emitted from                                                                                     | Purpose / payload                                                                                                                          |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `project.created`                | `ProjectCreatedEvent`              | `ProjectService.createProject`                                                                   | A project was created. `projectId`, `organizationId`, `name`, `slug`                                                                       |
| `project.deleted`                | `ProjectDeletedEvent`              | `ProjectService.deleteProject`                                                                   | A project was removed (cleanup, revoke integrations). `projectId`, `organizationId`, `name`, `slug`                                        |
| `project.server-key.created`     | `ProjectServerKeyCreatedEvent`     | `ApiKeysService.createProjectApiKey`                                                             | A project server key was issued. `projectId`, `keyId`, `name`, `roleId`, `createdByUserId`, `expiresAt`                                    |
| `project.server-key.regenerated` | `ProjectServerKeyRegeneratedEvent` | `ApiKeysService.regenerateProjectApiKey`                                                         | A key was rotated; the previous token stops working. `projectId`, `keyId`, `name`, `expiresAt`                                             |
| `project.server-key.deleted`     | `ProjectServerKeyDeletedEvent`     | `ApiKeysService.revokeProjectApiKey`                                                             | A key was revoked. `projectId`, `keyId`, `name`                                                                                            |
| `code-report.analysis.started`   | `CodeReportAnalysisStartedEvent`   | `CodeReportAnalysisService.startAnalysis`                                                        | A scan started (`in_progress`). `analysisId`, `serviceId`, `tool`, `startedAt`                                                             |
| `code-report.analysis.completed` | `CodeReportAnalysisCompletedEvent` | `CodeReportAnalysisService.completeAnalysis`                                                     | A scan finished with results and frozen policy compliance. `analysisId`, `serviceId`, `tool`, `completedAt`, `summary`, `policyCompliant`  |
| `code-report.analysis.failed`    | `CodeReportAnalysisFailedEvent`    | `CodeReportAnalysisService.failAnalysis`                                                         | A scan could not complete. `analysisId`, `serviceId`, `tool`, `error`, `failedAt`                                                          |
| `vault.environment.created`      | `VaultEnvironmentCreatedEvent`     | `VaultService.createEnvironment`                                                                 | A vault environment was added. `projectId`, `environmentId`, `name`, `slug`                                                                |
| `vault.environment.updated`      | `VaultEnvironmentUpdatedEvent`     | `VaultService.updateEnvironment`                                                                 | An environment was renamed/re-slugged. `projectId`, `environmentId`, `slug`, `changes`                                                     |
| `vault.environment.deleted`      | `VaultEnvironmentDeletedEvent`     | `VaultService.deleteEnvironment`                                                                 | An environment was removed. `projectId`, `environmentId`, `name`, `slug`                                                                   |
| `organization.created`           | `OrganizationCreatedEvent`         | `OrganizationService.createOrganization`                                                         | A new organization exists (provisioning hooks). `organizationId`, `name`, `slug`                                                           |
| `organization.updated`           | `OrganizationUpdatedEvent`         | `OrganizationService.updateOrganization`                                                         | Organization metadata changed. `organizationId`, `name`, `slug`, `changes`                                                                 |
| `organization.deleted`           | `OrganizationDeletedEvent`         | `OrganizationService.deleteOrganization`                                                         | An organization was removed. `organizationId`, `name`, `slug`                                                                              |
| `organization.user.assigned`     | `OrganizationUserAssignedEvent`    | `UserAccessService.createOrganizationUser` / `inviteOrganizationUser` / `assignOrganizationUser` | A user gained access to an organization. `organizationId`, `userId`, `roleId`, `accessId`, `origin` (`created` \| `invited` \| `assigned`) |
| `user.created`                   | `UserCreatedEvent`                 | `UserService.createUser`, `UserAccessService.createClusterUser` / `createOrganizationUser`       | A user account was created. `userId`, `username`, `email`, `scope`, `organizationId`, `roleId`                                             |
| `user.deleted`                   | `UserDeletedEvent`                 | `UserService.deleteUser`, `UserAccessService.removeAccess`                                       | A user account was deleted. `userId`, `username`, `scope`, `organizationId`                                                                |

## Adding a new event

1. Create `src/modules/events/domain/events/<name>.event.ts` with a payload interface and a class
   extending `DomainEvent` that declares `static readonly eventName` and the `name` getter.
2. Register the class in `EVENT_CATALOG` and re-export it from `src/modules/events/index.ts`.
3. Emit it from the application service **after** the write succeeds, never from a route or a
   repository.
4. Add the row to the table above.

## Monitoring

`/cluster-settings/monitoring` (cluster admin only) shows total events, processed events and events
without subscribers, plus pending, failed, expired and the configured lifetime. The table lists every
event in `EVENT_CATALOG` — even the ones that never fired — and highlights those with zero
subscribers. It refreshes every 10 s against `/cluster-settings/monitoring/metrics`.

## Logging

All logs are structured (pino, see `src/lib/server/logger.ts`) under the modules `events`,
`events-bus` and `events-store`:

- `event bus started` — catalog, TTL and sweep interval
- `event handler registered` / `event handler removed` / `subscriber attached` / `subscriber detached`
- `event emitted` (with `subscribers`) and `event processed`
- `event emitted without subscribers` (warn)
- `event handler "<name>" failed for <event>` (error)
- `event discarded: nobody consumed it before its lifetime expired` (warn)

## Constraints

- One process, one store: with several Cloud Run instances each instance has its own event store.
  Do not use this bus for cross-instance coordination or for anything that must not be lost.
- Emit only after the state change is persisted in GitDB.
- Handlers must be idempotent and must not throw expecting the caller to react; failures are logged
  and counted, not retried.

## Tests

`src/modules/events/application/event-bus.service.test.ts` covers delivery, unsubscribe,
attach/detach, handler failures, per-event counters and TTL expiry. Run with `bun run test`.
