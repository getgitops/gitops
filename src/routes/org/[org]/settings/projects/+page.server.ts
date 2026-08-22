import { organizationService } from '../../../../../modules/organization';

export async function load({ params }) {
  const organization = await organizationService.findBySlug(params.org);
  return { organization };
}

