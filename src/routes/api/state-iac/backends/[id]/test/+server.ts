import { toResponse } from '#lib/server/alerts/http';
import { testBackend } from '#lib/server/state-iac/backends';

// POST /api/state-iac/backends/<id>/test: lists the bucket and reads meta.yaml (read-only)
export async function POST({ params, locals }) {
  return toResponse(await testBackend(locals, params.id));
}
