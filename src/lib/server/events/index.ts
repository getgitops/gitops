import { InProcessEventBus, type EventBus } from './event-bus';

export { InProcessEventBus, actorFromRequest } from './event-bus';
export type { EventBus, InProcessEventBusOptions } from './event-bus';
export type * from './types';

const GLOBAL_KEY = Symbol.for('gitops.events.bus');

type GlobalWithBus = typeof globalThis & { [GLOBAL_KEY]?: EventBus };

/**
 * Process-wide event bus. Stored on `globalThis` so Vite HMR re-evaluating this module in
 * development keeps the same instance instead of piling up duplicate subscribers.
 *
 * Services receive it through their constructor from their module's `index.ts`; only composition
 * roots import this singleton.
 */
export const eventBus: EventBus = ((globalThis as GlobalWithBus)[GLOBAL_KEY] ??=
  new InProcessEventBus());
