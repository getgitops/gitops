import { readJson, toResponse } from '#lib/server/alerts/http';
import {
  backendInputFrom,
  deleteBackend,
  getBackend,
  updateBackend,
} from '#lib/server/state-iac/backends';

export async function GET({ params, locals }) {
  return toResponse(await getBackend(locals, params.id));
}

// PATCH /api/state-iac/backends/<id>: omitted fields keep their value, omitted credentials keep the
// stored ones (they are never returned, so they have to be typed again to change them)
export async function PATCH({ params, request, locals }) {
  const body = await readJson(request);
  return toResponse(await updateBackend(locals, params.id, backendInputFrom(body)));
}

// DELETE /api/state-iac/backends/<id>: also removes its bindings; the bucket is never touched
export async function DELETE({ params, locals }) {
  return toResponse(await deleteBackend(locals, params.id));
}
