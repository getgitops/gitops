import { redirect } from '@sveltejs/kit';
import { organizationService } from '../modules/organization';

export async function load() {
  const organization = await organizationService.findBySlug('gitops');
  throw redirect(302, `/org/${organization.slug}/overview`);
}
