import { page } from '$app/state';
import { toStore } from 'svelte/store';

export function createPageStore() {
  return toStore(() => page);
}