import { redirect } from '@sveltejs/kit';
import { organizationService } from '$modules/organization';

export async function load({ params }) {
  const organization = await organizationService.tryFindBySlug(params.org);
  if (!organization) {
    throw redirect(302, '/org?error=organization-not-found');
  }
  throw redirect(302, `/org/${organization.slug}/overview`);
}
