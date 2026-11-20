import { json } from '@sveltejs/kit';
import { resolveLocation } from '#lib/server/alerts/access';
import { readJson, toResponse } from '#lib/server/alerts/http';
import { testDraftAlert } from '#lib/server/alerts/operations';

// POST /api/alerts/test { organizationId | projectId, …alert, payload?, sampleProjectId? }: dry run of an unsaved alert
export async function POST({ request, locals }) {
  const body = await readJson(request);
  const lookup = await resolveLocation({
    organizationId: typeof body.organizationId === 'string' ? body.organizationId : null,
    projectId: typeof body.projectId === 'string' ? body.projectId : null,
  });
  if (!lookup.ok) return json({ error: lookup.error }, { status: lookup.status });
  return toResponse(await testDraftAlert(locals, lookup.location, body));
}
