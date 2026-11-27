import { goto } from '$app/navigation';

/**
 * Reloads the page skipping the State IaC cache (`?refresh=1`), then drops the parameter so the
 * next navigations use the cache again.
 */
export async function refreshStacks(current: URL): Promise<void> {
  const url = new URL(current);
  url.searchParams.set('refresh', '1');
  // the current page itself, already resolved (same rule as the .svelte files, where it is off)
  // eslint-disable-next-line svelte/no-navigation-without-resolve
  await goto(`${url.pathname}${url.search}`, { replace: true, invalidateAll: true });
  url.searchParams.delete('refresh');
  // eslint-disable-next-line svelte/no-navigation-without-resolve
  await goto(`${url.pathname}${url.search}`, { replace: true, shallow: true });
}
