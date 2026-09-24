import { error } from '@sveltejs/kit';
import { workspace } from '$lib/state/workspace.svelte';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	if (!workspace.pages[params.page]) {
		// Workspaces aren't in the URL yet, so a link to another workspace's page
		// (or a reload after switching) opens the first workspace that has it.
		const owner = workspace.all.find((w) => w.pages[params.page]);
		if (!owner) error(404, 'Page not found');
		workspace.switchTo(owner.id);
	}
	return { slug: params.page };
};
