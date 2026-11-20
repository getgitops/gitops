import { InProcessEventBus, type EventBus } from './event-bus';
import { InMemoryEventLog } from './event-log';
import { readEventsExpirationMs } from './config';
import { createLogger } from '#lib/server/logger';

export { InProcessEventBus, actorFromRequest } from './event-bus';
export type { EventBus, InProcessEventBusOptions } from './event-bus';
export type * from './types';
export { resolveProjectScope, type ProjectScopeLookup } from './scope';
export { publishAfterWrite, type EventPublisher } from './publish';
export { InMemoryEventLog } from './event-log';
export type { EventAck, EventLogQuery, LoggedEvent } from './event-log';

const GLOBAL_KEY = Symbol.for('gitops.events.bus');
const LOG_KEY = Symbol.for('gitops.events.log');

type GlobalWithBus = typeof globalThis & {
  [GLOBAL_KEY]?: EventBus;
  [LOG_KEY]?: InMemoryEventLog;
};

/**
 * Process-wide event bus. Stored on `globalThis` so Vite HMR re-evaluating this module in
 * development keeps the same instance instead of piling up duplicate subscribers.
 *
 * Services receive it through their constructor from their module's `index.ts`; only composition
 * roots import this singleton.
 */
export const eventBus: EventBus = ((globalThis as GlobalWithBus)[GLOBAL_KEY] ??=
  new InProcessEventBus());

/**
 * Recent events for the organization events page, kept for `GITOPS_EVENTS_EXPIRATION`. Attached
 * to the bus once per process (also HMR-safe).
 */
export const eventLog: InMemoryEventLog = ((globalThis as GlobalWithBus)[LOG_KEY] ??= (() => {
  const log = new InMemoryEventLog({
    ttlMs: readEventsExpirationMs((value) =>
      createLogger('events').warn(
        { value },
        '[events] invalid GITOPS_EVENTS_EXPIRATION, using the default',
      ),
    ),
  });
  log.attach(eventBus);
  return log;
})());
