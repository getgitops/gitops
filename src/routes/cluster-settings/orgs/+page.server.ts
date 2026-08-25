import { fail } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { organizationService } from '$modules/organization';

function errorResponse(error: unknown) {
  return fail(400, {
    error: error instanceof Error ? error.message : 'Organization action failed.',
  });
}

export async function load() {
  const organizations = await organizationService.listOrganizations();
  return { organizations };
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
