import { readJson, toResponse } from '#lib/server/alerts/http';
import { testAlert } from '#lib/server/alerts/operations';

// POST /api/alerts/<id>/test { payload?, sampleProjectId?, send? }: dry run; `send: true` also
// emails the recipients that would get it ([Test] subject, rate limited per caller)
export async function POST({ params, request, locals }) {
  const body = await readJson(request);
  return toResponse(await testAlert(locals, params.id, body));
}
