import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestActor = {
  /** Commit author name written by GitDB. */
  name: string;
  /** Commit author email written by GitDB. */
  email: string;
  /** Set when the request is authenticated with a session. */
  userId?: string;
  /** Set when the request is authenticated with an `Authorization: Bearer gvs_...` API key. */
  apiKeyId?: string;
  /** Project the API key is confined to (`null` for keys that are not project-scoped). */
  apiKeyProjectId?: string | null;
};

// one store per process: long-lived singletons (the event bus on `globalThis`) keep a reference
// to `getCurrentActor`, so a second store created when Vite re-evaluates this module in dev would
// leave them reading an empty context (every event would look like a system event)
const STORAGE_KEY = Symbol.for('gitops.request-context');
const storage: AsyncLocalStorage<RequestActor> = ((
  globalThis as typeof globalThis & { [STORAGE_KEY]?: AsyncLocalStorage<RequestActor> }
)[STORAGE_KEY] ??= new AsyncLocalStorage<RequestActor>());

/**
 * Runs `fn` with `actor` available to anything that reads the request context during its
 * execution: `getGitDb()` (commit author) and the domain event bus (event actor).
 */
export function runWithActor<T>(actor: RequestActor, fn: () => T): T {
  return storage.run(actor, fn);
}

/** The actor for the request currently being handled, if one was set. */
export function getCurrentActor(): RequestActor | null {
  return storage.getStore() ?? null;
}
