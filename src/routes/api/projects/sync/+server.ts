import { json } from '@sveltejs/kit';
import { storageBackendService } from '../../../../modules/config';
import { projectService } from '../../../../modules/projects';
import { storageService } from '../../../../modules/storage';

export async function POST({ cookies }) {
  try {
    const backends = storageBackendService.list();
    if (!backends.length) throw new Error('No storage configured');

    const activeId = cookies.get('active_backend') || backends[0].id;
    const config = storageBackendService.getById(activeId) || storageBackendService.getById(backends[0].id);

    if (!config) throw new Error('No storage configured');

    const { states: files } = await storageService.listPulumiStates(config);
    const count = projectService.syncFromPulumiStateKeys(files);

    return json({ success: true, count });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
