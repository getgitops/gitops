import { error } from '@sveltejs/kit';
import { workspace } from '$lib/state/workspace.svelte';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	if (!workspace.pages[params.page]) error(404, 'Page not found');
	return { slug: params.page };
};
