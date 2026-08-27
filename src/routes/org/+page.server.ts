import { organizationService } from '$modules/organization';
import { cancanService } from '$modules/auth';

export async function load({ locals }) {
  const allOrganizations = await organizationService.listOrganizations();
  const allowedOrganizationIds = await cancanService.organizationIdsForUser(locals.user);

  const organizations =
    allowedOrganizationIds === null
      ? allOrganizations
      : allOrganizations.filter((organization) => allowedOrganizationIds.includes(organization.id));

  return { organizations };
}
