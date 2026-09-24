export type ServerReadyState =
  | { status: 'pending' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

let state: ServerReadyState = { status: 'pending' };

export function getServerReadyState(): ServerReadyState {
  return state;
}

export function isServerReady() {
  return state.status === 'ready';
}

export function markServerReady() {
  state = { status: 'ready' };
}

export function markServerFailed(error: unknown) {
  state = { status: 'error', message: error instanceof Error ? error.message : 'Startup failed' };
}
