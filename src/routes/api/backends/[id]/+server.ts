import { json } from '@sveltejs/kit';
import { storageBackendService } from '../../../../modules/config';

export async function DELETE({ params }) {
  try {
    storageBackendService.deleteById(params.id);
    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
