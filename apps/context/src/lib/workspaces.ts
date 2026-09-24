import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import { workspace } from '$lib/state/workspace.svelte';

/**
 * Makes another workspace current. On a page it opens the page the user left that
 * workspace on; on settings it stays put so they show the new workspace.
 */
export function switchWorkspace(id: string) {
	if (id === workspace.currentId) return;
	const target = workspace.entryPage(id);
	workspace.switchTo(id);
	if (page.route.id?.startsWith('/(app)/settings')) return;
	goto(resolve('/(app)/p/[page]', { page: target }));
}
