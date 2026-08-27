import { fail } from '@sveltejs/kit';
import { cancanService, roleService } from '$modules/auth';
import { organizationService } from '$modules/organization';

function parsePermissions(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const permissions = JSON.parse(value) as unknown;
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((permission): permission is string => typeof permission === 'string');
}

function errorResponse(errorValue: unknown) {
  return fail(400, {
    error: errorValue instanceof Error ? errorValue.message : 'Role action failed.',
  });
}

export async function load({ parent }) {
  const { organization } = await parent();
  return { organization };
}

export const actions = {
  async createRole({ request, locals, params }) {
    const organization = await organizationService.findBySlug(params.org);
    if (!(await cancanService.canManageOrganization(locals.user, organization.id))) {
      return fail(403, { error: 'Forbidden' });
    }

    try {
      const form = await request.formData();
      const role = await roleService.createRole({
        name: String(form.get('name') ?? ''),
        slug: String(form.get('slug') ?? ''),
        permissions: parsePermissions(form.get('permissions')),
        scope: 'organization',
        organizationId: organization.id,
      });
      return { success: true, role };
    } catch (errorValue: unknown) {
      return errorResponse(errorValue);
    }
  },
};
