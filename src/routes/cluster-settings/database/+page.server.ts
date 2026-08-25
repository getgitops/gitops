import { fail } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { resetGitDb } from '$lib/server/gitdb';
import {
  DEFAULT_SYNC_POLL_SECONDS,
  MAX_SYNC_POLL_SECONDS,
  MIN_SYNC_POLL_SECONDS,
  readRepositoryConfigView,
  saveRepositoryConfig,
  saveSyncPollSeconds,
  type GitDbAuthMode,
} from '$lib/server/gitdb/config';
import { gitDbSyncService } from '$lib/server/gitdb/sync';

function errorResponse(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'Database action failed.' });
}

function parseAuthMode(value: unknown): GitDbAuthMode {
  const mode = String(value ?? 'none');
  if (mode === 'none' || mode === 'basic' || mode === 'token') return mode;
  throw new Error('Invalid authentication mode');
}

export async function load() {
  return {
    repository: readRepositoryConfigView(),
    status: gitDbSyncService.getStatus(),
    limits: {
      min: MIN_SYNC_POLL_SECONDS,
      max: MAX_SYNC_POLL_SECONDS,
      default: DEFAULT_SYNC_POLL_SECONDS,
    },
  };
}

export const actions = {
  async saveRepository({ request, locals }) {
    if (!cancanService.canAccessAdminArea(locals.user)) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      const authMode = parseAuthMode(form.get('authMode'));
      const rawSecret = form.get('secret');
      // an empty secret field means "keep the stored credential"
      const secret =
        typeof rawSecret === 'string' && rawSecret.length > 0 ? rawSecret : undefined;

      const config = saveRepositoryConfig({
        repositoryUrl: String(form.get('repositoryUrl') ?? ''),
        branch: String(form.get('branch') ?? ''),
        authMode,
        username: String(form.get('username') ?? ''),
        secret,
        authorName: String(form.get('authorName') ?? ''),
        authorEmail: String(form.get('authorEmail') ?? ''),
      });

      resetGitDb();
      await gitDbSyncService.ensureCloned(config);
      await gitDbSyncService.syncNow();

      return { success: true, repository: readRepositoryConfigView() };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async saveSyncPoll({ request, locals }) {
    if (!cancanService.canAccessAdminArea(locals.user)) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      saveSyncPollSeconds(Number(form.get('syncPollSeconds')));
      gitDbSyncService.schedule();
      return { success: true, repository: readRepositoryConfigView() };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async syncNow({ locals }) {
    if (!cancanService.canAccessAdminArea(locals.user)) return fail(403, { error: 'Forbidden' });

    const status = await gitDbSyncService.syncNow();
    if (status.state === 'error') {
      return fail(400, { error: status.lastError ?? 'Sync failed.' });
    }
    return { success: true, status };
  },
};
