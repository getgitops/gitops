import { redirect } from '@sveltejs/kit';
import { pageHref } from '$lib/links';
import type { PageLoad } from './$types';

export const load: PageLoad = () => {
	redirect(307, pageHref('home'));
};
