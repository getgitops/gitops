import { fail } from '@sveltejs/kit';
import { cancanService, roleService, userAccessService } from '#modules/auth';
import { organizationService } from '#modules/organization';
import { projectService } from '#modules/projects';

function errorResponse(error: unknown) {
  return fail(400, {
    error: error instanceof Error ? error.message : 'Organization action failed.',
  });
}

export async function load() {
  const organizations = await organizationService.listOrganizations();

  // proyectos y miembros de cada organización; si una cuenta falla, se muestra sin cifra
  const counted = await Promise.all(
    organizations.map(async (organization) => {
      const [projects, members] = await Promise.all([
        projectService.listProjectsByOrganization(organization.id).catch(() => null),
        userAccessService.listUsers('organization', organization.id).catch(() => null),
      ]);
      return {
        ...organization,
        projectCount: projects?.length ?? null,
        memberCount: members?.length ?? null,
      };
    }),
  );

  return { organizations: counted };
}

export const actions = {
  async createOrganization({ request, locals }) {
    if (!cancanService.canAccessAdminArea(locals.user)) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      const organization = await organizationService.createOrganization({
        name: String(form.get('name') ?? ''),
        slug: String(form.get('slug') ?? '') || undefined,
        description: String(form.get('description') ?? '') || undefined,
      });
      await roleService.createDefaultOrganizationRoles(organization.id);
      return { success: true, organization };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async deleteOrganization({ request, locals }) {
    if (!cancanService.canAccessAdminArea(locals.user)) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      await organizationService.deleteOrganization(String(form.get('id') ?? ''));
      return { success: true };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },
};
