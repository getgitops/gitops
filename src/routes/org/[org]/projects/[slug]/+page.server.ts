import { redirect } from '@sveltejs/kit';

export function load({ params }) {
  throw redirect(302, `/org/${params.org}/projects/${params.slug}/settings/overview`);
}
