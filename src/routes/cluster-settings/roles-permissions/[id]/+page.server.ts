import { error, fail } from '@sveltejs/kit';
import { cancanService, roleService } from '$modules/auth';

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

export async function load({ params }) {
  const roles = await roleService.listRoles('cluster');
  const role = roles.find((row) => row.id === params.id);
  if (!role) throw error(404, 'Role not found');
  return { role };
}

export const actions = {
  async updateRole({ request, locals }) {
    if (!cancanService.canAccessAdminArea(locals.user)) return fail(403, { error: 'Forbidden' });

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

  async deleteRole({ request, locals }) {
    if (!cancanService.canAccessAdminArea(locals.user)) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      await roleService.deleteRole(String(form.get('id') ?? ''));
      return { success: true };
    } catch (errorValue: unknown) {
      return errorResponse(errorValue);
    }
  },
};
