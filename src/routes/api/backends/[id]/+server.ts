import { json } from '@sveltejs/kit';
import { db } from '$lib/db';

export async function DELETE({ params }) {
  try {
    db.prepare('DELETE FROM storage_backends WHERE id = ?').run(params.id);
    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
