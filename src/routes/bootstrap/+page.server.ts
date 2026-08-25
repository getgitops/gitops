import { fail, redirect } from '@sveltejs/kit';
import { getBootstrapState, nextBootstrapStep } from '$lib/server/bootstrap';
import { resetGitDb } from '$lib/server/gitdb';
import {
  DEFAULT_SYNC_POLL_SECONDS,
  MAX_SYNC_POLL_SECONDS,
  MIN_SYNC_POLL_SECONDS,
  readRepositoryConfigView,
  saveRepositoryConfig,
  type GitDbAuthMode,
} from '$lib/server/gitdb/config';
import { gitDbSyncService } from '$lib/server/gitdb/sync';

function errorResponse(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'Setup step failed.' });
}

function parseAuthMode(value: unknown): GitDbAuthMode {
  const mode = String(value ?? 'none');
  if (mode === 'none' || mode === 'basic' || mode === 'token') return mode;
  throw new Error('Invalid authentication mode');
}

export async function load() {
  const state = await getBootstrapState();
  return {
    state,
    step: nextBootstrapStep(state),
    repository: readRepositoryConfigView(),
    limits: {
      min: MIN_SYNC_POLL_SECONDS,
      max: MAX_SYNC_POLL_SECONDS,
      default: DEFAULT_SYNC_POLL_SECONDS,
    },
  };
}

export const actions = {
  async configureRepository({ request }) {
    try {
      const form = await request.formData();
      const authMode = parseAuthMode(form.get('authMode'));
      const rawSecret = form.get('secret');

      const config = saveRepositoryConfig({
        repositoryUrl: String(form.get('repositoryUrl') ?? ''),
        branch: String(form.get('branch') ?? ''),
        authMode,
        username: String(form.get('username') ?? ''),
        secret: typeof rawSecret === 'string' && rawSecret.length > 0 ? rawSecret : undefined,
        authorName: String(form.get('authorName') ?? ''),
        authorEmail: String(form.get('authorEmail') ?? ''),
        syncPollSeconds: Number(form.get('syncPollSeconds') ?? DEFAULT_SYNC_POLL_SECONDS),
      });

      resetGitDb();
      await gitDbSyncService.ensureCloned(config);

      const status = await gitDbSyncService.syncNow();
      if (status.state === 'error') {
        return fail(400, { error: status.lastError ?? 'Could not reach the repository.' });
      }

      console.info('[bootstrap] repository configured, seeding auth defaults');
      const { ensureAuthReady } = await import('$modules/auth');
      await ensureAuthReady();
      console.info('[bootstrap] auth defaults ready');

      return { success: true };
    } catch (error: unknown) {
      console.error('[bootstrap] repository configuration failed', error);
      return errorResponse(error);
    }
  },

  async createAdministrator({ request }) {
    const state = await getBootstrapState();
    if (!state.repository) return fail(409, { error: 'Configure the repository first.' });
    // the wizard is unauthenticated, so this step is only allowed while no admin exists
    if (state.administrator) return fail(409, { error: 'A cluster administrator already exists.' });

    try {
      const form = await request.formData();
      const password = String(form.get('password') ?? '');
      if (password !== String(form.get('passwordConfirmation') ?? '')) {
        throw new Error('Passwords do not match');
      }
      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      const { ensureAuthReady, roleService, userAccessService } = await import('$modules/auth');
      await ensureAuthReady();

      const roles = await roleService.listRoles('cluster');
      const adminRole = roles.find((role: any) => role.slug === 'cluster-admin');
      if (!adminRole) throw new Error('Cluster admin role is not available');

      await userAccessService.createClusterUser({
        username: String(form.get('username') ?? ''),
        email: String(form.get('email') ?? '') || null,
        password,
        roleId: adminRole.id,
      });

      return { success: true };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async createOrganization({ request }) {
    const state = await getBootstrapState();
    if (!state.administrator) return fail(409, { error: 'Create the cluster administrator first.' });
    if (state.organization) return fail(409, { error: 'An organization already exists.' });

    try {
      const form = await request.formData();
      const { organizationService } = await import('$modules/organization');
      await organizationService.createOrganization({
        name: String(form.get('name') ?? ''),
        slug: String(form.get('slug') ?? '') || undefined,
        description: String(form.get('description') ?? '') || undefined,
      });
    } catch (error: unknown) {
      return errorResponse(error);
    }

    throw redirect(303, '/login');
  },
};
