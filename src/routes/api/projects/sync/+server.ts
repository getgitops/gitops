import { json } from '@sveltejs/kit';
import { storageBackendService } from '../../../../modules/config';
import { projectService } from '../../../../modules/projects';
import { storageService } from '../../../../modules/storage';
import { cancanService } from '../../../../modules/auth';

export async function POST({ cookies, locals }) {
  if (!(await cancanService.canSessionUser(locals.user, 'stateiac:update', { scope: 'cluster' }))) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const backends = storageBackendService.list();
    if (!backends.length) throw new Error('No storage configured');

    const activeId = cookies.get('active_backend') || backends[0].id;
    const config =
      storageBackendService.getById(activeId) || storageBackendService.getById(backends[0].id);

    if (!config) throw new Error('No storage configured');

    const { states: files } = await storageService.listPulumiStates(config);
    const count = projectService.syncFromPulumiStateKeys(files);

    return json({ success: true, count });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
