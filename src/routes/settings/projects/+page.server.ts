import { organizationService } from '../../../modules/organization';

export async function load() {
  const organization = await organizationService.findBySlug('gitops');
  return { organization };
}
