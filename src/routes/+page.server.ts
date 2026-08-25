import { redirect } from '@sveltejs/kit';
import { organizationService } from '$modules/organization';

export async function load() {
  const organization = await organizationService.getDefaultOrganization();
  if (!organization) {
    throw redirect(302, '/cluster-settings/orgs');
  }
  throw redirect(302, `/org/${organization.slug}/overview`);
}
