import { resolve } from '$app/paths';

export const pageHref = (slug: string) => resolve('/(app)/p/[page]', { page: slug });

export const settingsHref = (section?: string) =>
	section ? resolve('/(app)/settings/[section]', { section }) : resolve('/(app)/settings');
