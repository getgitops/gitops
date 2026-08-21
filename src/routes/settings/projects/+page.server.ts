import { organizationService } from '../../../modules/organization';

export async function load() {
  const organization = await organizationService.getDefaultOrganization();
  return { organization };
}

