import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestActor = {
  name: string;
  email: string;
};

const storage = new AsyncLocalStorage<RequestActor>();

/** Runs `fn` with `actor` available to any `getGitDb()` call made during its execution. */
export function runWithActor<T>(actor: RequestActor, fn: () => T): T {
  return storage.run(actor, fn);
}

/** The actor for the request currently being handled, if one was set. */
export function getCurrentActor(): RequestActor | null {
  return storage.getStore() ?? null;
}
