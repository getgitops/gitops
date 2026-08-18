import { json } from '@sveltejs/kit';
import { storageBackendService } from '../../../../modules/config';
import { can } from '../../../../modules/auth';

export async function DELETE({ params, locals }) {
  if (!can(locals.user, 'stateiac:delete')) {
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
