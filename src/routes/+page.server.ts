import { redirect } from '@sveltejs/kit';

export async function load({ parent }) {
  const { isConfigured } = await parent();

  if (isConfigured) {
    throw redirect(302, '/pulumi-state');
  }

  throw redirect(302, '/settings');
}
