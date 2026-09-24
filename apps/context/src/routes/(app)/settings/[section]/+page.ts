import { error } from '@sveltejs/kit';
import { settingsSections } from '$lib/settings';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const section = settingsSections.find((s) => s.id === params.section && !s.soon);
	if (!section) error(404, 'Settings section not found');
	return { section: section.id! };
};
