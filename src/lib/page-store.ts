import { page } from '$app/state';
import { toStore } from 'svelte/store';

// `page` is a single long-lived object whose fields are reactive getters. Returning it as-is
// (`toStore(() => page)`) reads none of those getters, so the store never re-emits after a
// client-side navigation and `$page.url` stays frozen at the first page that was rendered.
// Reading each field here registers them as dependencies and yields a fresh snapshot per change.
export function createPageStore() {
  return toStore(() => ({
    url: page.url,
    params: page.params,
    route: page.route,
    status: page.status,
    error: page.error,
    data: page.data,
    form: page.form,
    state: page.state,
  }));
}
