import { fail } from '@sveltejs/kit';
import { cancanService, roleService, userAccessService } from '$modules/auth';
import { organizationService } from '$modules/organization';

function errorResponse(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'User action failed.' });
}

export async function load({ parent }) {
  const { organization } = await parent();
  const [users, roles] = await Promise.all([
    userAccessService.listUsers('organization', organization.id),
    roleService.listRoles('organization', organization.id),
  ]);
  return { users, roles };
}

export const actions = {
  async addUser({ request, locals, params }) {
    const organization = await organizationService.findBySlug(params.org);
    if (!(await cancanService.canManageOrganization(locals.user, organization.id))) {
      return fail(403, { error: 'Forbidden' });
    }

    try {
      const form = await request.formData();
      const user = await userAccessService.createOrganizationUser({
        organizationId: organization.id,
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

  async inviteUser({ request, locals, params, url }) {
    const organization = await organizationService.findBySlug(params.org);
    if (!(await cancanService.canManageOrganization(locals.user, organization.id))) {
      return fail(403, { error: 'Forbidden' });
    }

    try {
      const form = await request.formData();
      const user = await userAccessService.inviteOrganizationUser({
        organizationId: organization.id,
        organizationName: organization.name,
        email: String(form.get('email') ?? ''),
        inviteUrl: `${url.origin}/auth/invitation`,
        invitedBy: locals.user?.username ?? null,
      });
      return { success: true, user };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async updateUserAccess({ request, locals, params }) {
    const organization = await organizationService.findBySlug(params.org);
    if (!(await cancanService.canManageOrganization(locals.user, organization.id))) {
      return fail(403, { error: 'Forbidden' });
    }

    try {
      const form = await request.formData();
      const user = await userAccessService.updateAccess({
        accessId: String(form.get('accessId') ?? ''),
        scope: 'organization',
        scopeId: organization.id,
        roleId: String(form.get('roleId') ?? ''),
        status: String(form.get('status') ?? ''),
      });
      return { success: true, user };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async removeUserAccess({ request, locals, params }) {
    const organization = await organizationService.findBySlug(params.org);
    if (!(await cancanService.canManageOrganization(locals.user, organization.id))) {
      return fail(403, { error: 'Forbidden' });
    }

    try {
      const form = await request.formData();
      await userAccessService.removeAccess({
        accessId: String(form.get('accessId') ?? ''),
        scope: 'organization',
        scopeId: organization.id,
      });
      return { success: true };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async resendInvitation({ request, locals, params, url }) {
    const organization = await organizationService.findBySlug(params.org);
    if (!(await cancanService.canManageOrganization(locals.user, organization.id))) {
      return fail(403, { error: 'Forbidden' });
    }

    try {
      const form = await request.formData();
      const user = await userAccessService.resendInvitation({
        accessId: String(form.get('accessId') ?? ''),
        scope: 'organization',
        scopeId: organization.id,
        organizationName: organization.name,
        inviteUrl: `${url.origin}/auth/invitation`,
        invitedBy: locals.user?.username ?? null,
      });
      return { success: true, user };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },
};
