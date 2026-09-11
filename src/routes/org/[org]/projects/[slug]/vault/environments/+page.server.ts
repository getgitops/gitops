import { redirect } from '@sveltejs/kit';

// Environments management moved into Vault > Settings.
export async function load({ params }) {
  throw redirect(302, `/org/${params.org}/projects/${params.slug}/vault/settings`);
}
