import { readJson, toResponse } from '#lib/server/alerts/http';
import { testAlert } from '#lib/server/alerts/operations';

// POST /api/alerts/<id>/test { payload?, sampleProjectId? }: dry run, nothing is sent
export async function POST({ params, request, locals }) {
  const body = await readJson(request);
  return toResponse(await testAlert(locals, params.id, body));
}
