import { json } from '@sveltejs/kit';
import { storageBackendService } from '../../../../modules/config';
import { cancanService } from '../../../../modules/auth';

export async function DELETE({ params, locals }) {
  if (!(await cancanService.canSessionUser(locals.user, 'stateiac:delete', { scope: 'cluster' }))) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    storageBackendService.deleteById(params.id);
    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
