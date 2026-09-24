import { fail, redirect } from '@sveltejs/kit';
import { getBootstrapState, nextBootstrapStep, refreshBootstrapState } from '$lib/server/bootstrap';
import { createLogger } from '$lib/server/logger';

const log = createLogger('bootstrap');

function errorResponse(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'Setup step failed.' });
}

export function load() {
  const state = getBootstrapState();
  return { state, step: nextBootstrapStep(state) };
}

export const actions = {
  async createAdministrator({ request }) {
    // the wizard is unauthenticated, so this step is only allowed while no admin exists
    if (getBootstrapState().administrator) {
      return fail(409, { error: 'A cluster administrator already exists.' });
    }

    try {
      const form = await request.formData();
      const password = String(form.get('password') ?? '');
      if (password !== String(form.get('passwordConfirmation') ?? '')) {
        throw new Error('Passwords do not match');
      }
      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      const { roleService, userAccessService } = await import('$modules/auth');

      const roles = await roleService.listRoles('cluster');
      const adminRole = roles.find((role: any) => role.slug === 'cluster-admin');
      if (!adminRole) throw new Error('Cluster admin role is not available');

      await userAccessService.createClusterUser({
        username: String(form.get('username') ?? ''),
        email: String(form.get('email') ?? '') || null,
        password,
        roleId: adminRole.id,
      });

      await refreshBootstrapState();
      return { success: true };
    } catch (error: unknown) {
      log.error(error, 'failed to create the cluster administrator');
      return errorResponse(error);
    }
  },

  async createOrganization({ request }) {
    const state = getBootstrapState();
    if (!state.administrator)
      return fail(409, { error: 'Create the cluster administrator first.' });
    if (state.organization) return fail(409, { error: 'An organization already exists.' });

    try {
      const form = await request.formData();
      const { organizationService } = await import('$modules/organization');
      const { roleService } = await import('$modules/auth');
      const organization = await organizationService.createOrganization({
        name: String(form.get('name') ?? ''),
        slug: String(form.get('slug') ?? '') || undefined,
        description: String(form.get('description') ?? '') || undefined,
      });
      await roleService.createDefaultOrganizationRoles(organization.id);

      await refreshBootstrapState();
    } catch (error: unknown) {
      log.error(error, 'failed to create the organization');
      return errorResponse(error);
    }

    throw redirect(303, '/auth/login');
  },
};
