import { getServerReadyState } from '$lib/server/server-ready';

export function load() {
  return getServerReadyState();
}
