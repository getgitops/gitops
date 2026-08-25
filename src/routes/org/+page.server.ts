import { organizationService } from '$modules/organization';

export async function load() {
  const organizations = await organizationService.listOrganizations();
  return { organizations };
}
