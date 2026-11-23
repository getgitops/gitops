import { redirect } from '@sveltejs/kit';

// the "Información" page became the Global tab; keep old links and bookmarks working
export function load({ params }) {
  throw redirect(301, `/org/${params.org}/projects/${params.slug}/settings/global`);
}
