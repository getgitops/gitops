import { fail } from '@sveltejs/kit';
import { canManageOrganization, roleService } from '../../../../../modules/auth';
import { organizationService } from '../../../../../modules/organization';

function parsePermissions(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const permissions = JSON.parse(value) as unknown;
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((permission): permission is string => typeof permission === 'string');
}

function errorResponse(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'Role action failed.' });
}

export async function load({ parent }) {
  const { organization } = await parent();
  const roles = await roleService.listRoles('organization', organization.id);
  return { roles };
}

export const actions = {
  async createRole({ request, locals, params }) {
    const organization = await organizationService.findBySlug(params.org);
    if (!canManageOrganization(locals.user, organization.id)) {
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
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async updateRole({ request, locals, params }) {
    const organization = await organizationService.findBySlug(params.org);
    if (!canManageOrganization(locals.user, organization.id)) {
      return fail(403, { error: 'Forbidden' });
    }

    try {
      const form = await request.formData();
      const role = await roleService.updateRole(String(form.get('id') ?? ''), {
        name: String(form.get('name') ?? ''),
        permissions: parsePermissions(form.get('permissions')),
      });
      return { success: true, role };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async deleteRole({ request, locals, params }) {
    const organization = await organizationService.findBySlug(params.org);
    if (!canManageOrganization(locals.user, organization.id)) {
      return fail(403, { error: 'Forbidden' });
    }

    try {
      const form = await request.formData();
      await roleService.deleteRole(String(form.get('id') ?? ''));
      return { success: true };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },
};
