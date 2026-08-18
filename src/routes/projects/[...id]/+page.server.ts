import { redirect } from '@sveltejs/kit';

export function load({ params, url }: { params: { id: string }; url: URL }) {
  const query = url.search || '';
  throw redirect(302, `/pulumi-state/${params.id}${query}`);
}
