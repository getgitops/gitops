import { json } from '@sveltejs/kit';
import { resolveLocation } from '#lib/server/alerts/access';
import { readJson, toResponse } from '#lib/server/alerts/http';
import { createAlert, listAlerts } from '#lib/server/alerts/operations';

// GET /api/alerts?organizationId=…  organization alerts
// GET /api/alerts?projectId=…       project alerts, plus the organization alerts it inherits
export async function GET({ url, locals }) {
  const lookup = await resolveLocation({
    organizationId: url.searchParams.get('organizationId'),
    projectId: url.searchParams.get('projectId'),
  });
  if (!lookup.ok) return json({ error: lookup.error }, { status: lookup.status });
  return toResponse(await listAlerts(locals, lookup.location));
}

// POST /api/alerts { organizationId | projectId, name, eventType, conditions, recipients, … }
export async function POST({ request, locals }) {
  const body = await readJson(request);
  const lookup = await resolveLocation({
    organizationId: typeof body.organizationId === 'string' ? body.organizationId : null,
    projectId: typeof body.projectId === 'string' ? body.projectId : null,
  });
  if (!lookup.ok) return json({ error: lookup.error }, { status: lookup.status });
  return toResponse(await createAlert(locals, lookup.location, body));
}
