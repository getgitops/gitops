import { redirect } from '@sveltejs/kit';
import { organizationService } from '$modules/organization';

export async function load({ locals, parent }) {
  const allowedOrganizationIds = await cancanService.organizationIdsForUser(locals.user);

  // cluster admins have no organization-scoped access rows to check — keep landing them
  // on the default organization's overview, same as before.
  if (allowedOrganizationIds === null) {
    const organization = await organizationService.getDefaultOrganization();
    if (!organization) {
      throw redirect(302, '/cluster-settings/orgs');
    }
    throw redirect(302, `/org/${organization.slug}/overview`);
  }

  if (allowedOrganizationIds.length === 0) {
    throw redirect(302, '/org');
  }

  const organizations = await organizationService.listOrganizations();
  const accessibleOrganizations = organizations.filter((organization) =>
    allowedOrganizationIds.includes(organization.id),
  );

  // The org overview requires an organization-scope permission. A user whose only access
  // is to specific projects shows up as "accessible" here but would still 403 there —
  // land them on an org they can actually view, in the order they were granted access.
  for (const organization of accessibleOrganizations) {
    if (await cancanService.canManageOrganization(locals.user, organization.id)) {
      throw redirect(302, `/org/${organization.slug}/overview`);
    }
  }

  // No organization-scope access anywhere — send them straight to a project they can
  // actually open instead of into a 403 on an overview page they can't see.
  const { projects } = await parent();
  const firstProject = projects[0];
  if (firstProject?.organization?.slug) {
    throw redirect(
      302,
      `/org/${firstProject.organization.slug}/projects/${firstProject.slug}/overview`,
    );
  }

  throw redirect(302, '/org');
}
