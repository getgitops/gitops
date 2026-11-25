import { readJson, toResponse } from '#lib/server/alerts/http';
import { testAlert } from '#lib/server/alerts/operations';

export async function POST({ params, request, locals }) {
  const body = await readJson(request);
  return toResponse(await testAlert(locals, params.id, body));
}
