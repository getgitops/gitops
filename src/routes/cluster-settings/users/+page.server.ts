import { fail } from '@sveltejs/kit';
import { isAdmin, roleService, userAccessService } from '../../../modules/auth';

function errorResponse(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'User action failed.' });
}

export async function load() {
  const [users, roles] = await Promise.all([
    userAccessService.listUsers('cluster'),
    roleService.listRoles('cluster'),
  ]);
  return { users, roles };
}

export const actions = {
  async addUser({ request, locals }) {
    if (!isAdmin(locals.user)) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      const user = await userAccessService.createClusterUser({
        username: String(form.get('username') ?? ''),
        email: String(form.get('email') ?? '') || null,
        password: String(form.get('password') ?? ''),
        roleId: String(form.get('roleId') ?? ''),
      });
      return { success: true, user };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async updateUserAccess({ request, locals }) {
    if (!isAdmin(locals.user)) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      const user = await userAccessService.updateAccess({
        accessId: String(form.get('accessId') ?? ''),
        scope: 'cluster',
        roleId: String(form.get('roleId') ?? ''),
        status: String(form.get('status') ?? ''),
      });
      return { success: true, user };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async removeUserAccess({ request, locals }) {
    if (!isAdmin(locals.user)) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      await userAccessService.removeAccess({
        accessId: String(form.get('accessId') ?? ''),
        scope: 'cluster',
      });
      return { success: true };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async resendInvitation({ request, locals }) {
    if (!isAdmin(locals.user)) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      const user = await userAccessService.resendInvitation({
        accessId: String(form.get('accessId') ?? ''),
        scope: 'cluster',
      });
      return { success: true, user };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },
};
