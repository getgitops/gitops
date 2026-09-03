import { fail } from '@sveltejs/kit';
import { organizationService } from '$modules/organization';
import { cancanService, roleService, userAccessService } from '$modules/auth';

export async function load({ locals }) {
  const allOrganizations = await organizationService.listOrganizations();
  const allowedOrganizationIds = await cancanService.organizationIdsForUser(locals.user);

  const organizations =
    allowedOrganizationIds === null
      ? allOrganizations
      : allOrganizations.filter((organization) => allowedOrganizationIds.includes(organization.id));

  const canCreateOrganization = await cancanService.canSessionUser(
    locals.user,
    'cluster:organization:create',
    { scope: 'cluster' },
  );

  return { organizations, canCreateOrganization };
}

export const actions = {
  async createOrganization({ request, locals }) {
    const canCreate = await cancanService.canSessionUser(
      locals.user,
      'cluster:organization:create',
      { scope: 'cluster' },
    );
    if (!canCreate) return fail(403, { error: 'Forbidden' });
    if (!locals.user?.id) return fail(401, { error: 'Unauthorized' });

    try {
      const form = await request.formData();
      const organization = await organizationService.createOrganization({
        name: String(form.get('name') ?? ''),
        slug: String(form.get('slug') ?? '') || undefined,
        description: String(form.get('description') ?? '') || undefined,
      });
      await roleService.createDefaultOrganizationRoles(organization.id);

      // the creator becomes org admin, otherwise they'd have no access to the org they just made
      const orgRoles = await roleService.listRoles('organization', organization.id);
      const orgAdminRole = orgRoles.find((role) => role.slug === 'org-admin');
      if (orgAdminRole) {
        await userAccessService.assignOrganizationUser({
          organizationId: organization.id,
          userId: locals.user.id,
          roleId: orgAdminRole.id,
        });
      }

      return { success: true, organization };
    } catch (error: unknown) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to create organization.',
      });
    }
  },
};
