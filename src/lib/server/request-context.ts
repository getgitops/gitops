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

const storage = new AsyncLocalStorage<RequestActor>();

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
