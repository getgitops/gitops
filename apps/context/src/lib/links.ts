import { resolve } from '$app/paths';

export const pageHref = (slug: string) => resolve('/(app)/p/[page]', { page: slug });
