import { fail } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { readRepositoryConfigView } from '$lib/server/gitdb/config';
import { gitDbSyncService } from '$lib/server/gitdb/sync';

export async function load() {
  return {
    repository: readRepositoryConfigView(),
    status: await gitDbSyncService.getStatus(),
  };
}

export const actions = {
  async syncNow({ locals }) {
    if (!cancanService.canAccessAdminArea(locals.user)) return fail(403, { error: 'Forbidden' });

    const status = await gitDbSyncService.syncNow();
    if (status.state === 'error') {
      return fail(400, { error: status.lastError ?? 'Sync failed.' });
    }
    return { success: true, status };
  },
};
