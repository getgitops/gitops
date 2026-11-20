# ADR 0001: Local domain event bus and configurable alerts

- Status: Proposed
- Date: 2026-11-20
- Issues: #76 (epic), #77 (this ADR and the `EventBus` class)

## Context

Notifications are direct calls from services to concrete notifiers (`InvitationNotifier`,
`PasswordResetNotifier`). To let organization and project admins create **configurable alerts**
("when `code_report.analysis.completed` happens for service `api-gateway` with critical
vulnerabilities, email these users or roles"), services need to announce what happened without
knowing who listens.

Constraints: GitDB is the only persistence layer, the app runs as a single SvelteKit process per
replica, and we do not want to operate a broker (Redis, Kafka, a queue) for this.

## Decision

Services publish **typed domain events** on an **in-process event bus**
(`#lib/server/events`). An alert engine (#79) subscribes to every event, matches the alerts
configured for the event's scope and notifies recipients by email.

```
Service ──publish(type, payload)──▶ EventBus (in-process) ──▶ AlertEngine ('*') ──▶ notify(Mail)
```

### 1. Event names

`<module>.<resource>.<action>` in **snake_case**, the action as a **past participle**. The
resource may be omitted when the module is the resource.

- `code_report.analysis.completed`, `code_report.analysis.failed`, `code_report.policy.violated`
- `vault.secret.created`, `vault.env.imported`
- `project.created`, `access.granted`, `api_key.revoked`

Each type and its payload is declared in `DomainEventMap` (`src/lib/server/events/types.ts`), so
`publish()` and `subscribe()` are type-checked end to end.

### 2. Delivery semantics

- Publish **after** the GitDB write has succeeded (after the repository `await`). A failed write
  publishes nothing.
- **Asynchronous** dispatch: `publish()` builds the envelope and returns it immediately; handlers
  run on later microtasks and add no latency to the request.
- **At-most-once**: events in flight when the process dies are lost. This is acceptable for
  alerts and must not be relied on for anything that needs a guarantee.
- **Per process**: an event published in one replica does not reach the others. Multi-replica
  delivery is out of scope for v1.
- **Ordering**: each subscriber receives events in publish order (a per-subscriber queue). A slow
  subscriber does not delay other subscribers.
- **Isolation**: every handler runs in its own `try/catch`. A failure is logged through
  `createLogger('events')` with the event `type` and `id`, and never reaches the publisher, other
  handlers, or later events.
- `drain()` waits for pending handlers (tests, graceful shutdown).

### 3. Persistence

- **Alerts** are configuration and are stored in **GitDB** (auditable, consistent with the rest of
  the platform).
- **Events are not persisted in GitDB.** For the organization events page (`/org/<org>/settings/events`),
  an in-memory log (`eventLog`, `InMemoryEventLog`) subscribes to the bus and keeps recent events
  together with a shared acknowledgement (who and when). Retention is configured with
  `GITOPS_EVENTS_EXPIRATION` (`30d`, `12h`, `45m`, a bare number is seconds; default `7d`), capped
  at 10,000 events. Like the bus, it is per process: a restart clears it, including the
  acknowledgements, and each replica shows its own list. Persisting events (and acks) in GitDB
  was considered and rejected for now: one commit per event and per ack.
- **Alert executions** (firing history) are **not** stored in GitDB in v1, to avoid one commit per
  email sent: only logs, plus optionally an in-memory buffer of the last N firings per alert.

### 4. Actor

`#lib/server/request-context` (`AsyncLocalStorage`) carries the request actor. Besides the commit
identity (`name`, `email`) it now carries `userId` for sessions and `apiKeyId` /
`apiKeyProjectId` for API keys, set by `hooks.server.ts`. The bus resolves the event actor from it
without changing service signatures:

| Request context                 | `event.actor`                              |
| ------------------------------- | ------------------------------------------ |
| `apiKeyId` set                  | `{ kind: 'api_key', apiKeyId, projectId }` |
| `userId` set                    | `{ kind: 'user', userId }`                 |
| none (startup, background work) | `{ kind: 'system' }`                       |

Publishers may pass an explicit `actor` to override it. Only `name` and `email` reach GitDB.

### 5. Security rules (mandatory for the whole epic)

- Payloads **never** contain secrets: no vault values, invitation or password reset tokens or
  URLs, password or token hashes, or API keys (a `keyPrefix` is fine).
- No recipient receives information about a resource they cannot read: recipients are **always**
  filtered with `cancanService` against the event's read permission and scope.

## Implementation

```
src/lib/server/events/
  types.ts            DomainEventMap, DomainEvent, EventActor, EventScope
  event-bus.ts        EventBus interface + InProcessEventBus
  testing.ts          RecordingEventBus for service unit tests
  index.ts            HMR-safe `eventBus` singleton + exports
  event-bus.test.ts
```

- The singleton lives on `globalThis` (`Symbol.for('gitops.events.bus')`) so Vite HMR does not
  create a second bus with duplicated subscribers in development.
- Services receive an `EventBus` through their **constructor** from their module's `index.ts`
  (composition root); only composition roots import the `eventBus` singleton. Unit tests inject a
  `RecordingEventBus` and assert on `events` / `ofType()`.
- No new dependencies.

## Consequences

- Services stay decoupled from alerts; adding a new consumer means subscribing, not editing
  services.
- Delivery is best effort. If we later need cross-replica delivery or guarantees, the
  `EventBus` interface allows swapping the implementation (e.g. an outbox in GitDB or a broker)
  without touching publishers.
- Every new event must respect the payload rules above and is covered by a no-leak test (#78).

## Alternatives considered

- **External broker (Redis pub/sub, Kafka, a queue)**: delivery across replicas and durability,
  at the cost of a new piece of infrastructure to run for a feature that tolerates losses. Rejected
  for v1.
- **Node `EventEmitter`**: synchronous dispatch, a throwing listener breaks the publisher, and no
  typing per event. Rejected in favour of a small dedicated class.
- **Persisting events in GitDB**: one commit per event is too much write volume and noise in the
  audit history.
