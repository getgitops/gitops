import { error, fail } from '@sveltejs/kit';
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

export async function load({ parent, params, locals }) {
  const { organization } = await parent();

  if (
    !(await cancanService.canSessionUser(locals.user, 'organization:roles:read', {
      scope: 'organization',
      organizationId: organization.id,
    }))
  ) {
    throw error(403, 'Forbidden');
  }

  const [roles, canUpdate, canDelete] = await Promise.all([
    roleService.listRoles('organization', organization.id),
    cancanService.canSessionUser(locals.user, 'organization:roles:update', {
      scope: 'organization',
      organizationId: organization.id,
    }),
    cancanService.canSessionUser(locals.user, 'organization:roles:delete', {
      scope: 'organization',
      organizationId: organization.id,
    }),
  ]);
  const role = roles.find((row) => row.id === params.id);
  if (!role) throw error(404, 'Role not found');
  return { organization, role, canUpdate, canDelete };
}

export const actions = {
  async updateRole({ request, locals, params }) {
    const organization = await organizationService.findBySlug(params.org);
    if (
      !(await cancanService.canSessionUser(locals.user, 'organization:roles:update', {
        scope: 'organization',
        organizationId: organization.id,
      }))
    ) {
      return fail(403, { error: 'Forbidden' });
    }

    try {
      const form = await request.formData();
      const role = await roleService.updateRole(String(form.get('id') ?? ''), {
        name: String(form.get('name') ?? ''),
        permissions: parsePermissions(form.get('permissions')),
      });
      return { success: true, role };
    } catch (errorValue: unknown) {
      return errorResponse(errorValue);
    }
  },

  async deleteRole({ request, locals, params }) {
    const organization = await organizationService.findBySlug(params.org);
    if (
      !(await cancanService.canSessionUser(locals.user, 'organization:roles:delete', {
        scope: 'organization',
        organizationId: organization.id,
      }))
    ) {
      return fail(403, { error: 'Forbidden' });
    }

    try {
      const form = await request.formData();
      await roleService.deleteRole(String(form.get('id') ?? ''));
      return { success: true };
    } catch (errorValue: unknown) {
      return errorResponse(errorValue);
    }
  },
};
