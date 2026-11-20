import { readJson, toResponse } from '#lib/server/alerts/http';
import { deleteAlert, getAlert, updateAlert } from '#lib/server/alerts/operations';

export async function GET({ params, locals }) {
  return toResponse(await getAlert(locals, params.id));
}

// partial update: omitted fields keep their value; the location of an alert never changes
export async function PATCH({ params, request, locals }) {
  const input = await readJson(request);
  delete input.organizationId;
  delete input.projectId;
  return toResponse(await updateAlert(locals, params.id, input));
}

export async function DELETE({ params, locals }) {
  return toResponse(await deleteAlert(locals, params.id));
}
