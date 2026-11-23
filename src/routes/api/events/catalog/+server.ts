import { json } from '@sveltejs/kit';
import { resolveLocation } from '#lib/server/alerts/access';
import { listCatalog } from '#lib/server/alerts/operations';

// GET /api/events/catalog?scope=project&projectId=… | ?scope=organization&organizationId=…
// alertable events the caller may read in that scope, with the fields an alert can filter on
export async function GET({ url, locals }) {
  const scope = url.searchParams.get('scope') ?? 'organization';
  if (scope !== 'organization' && scope !== 'project') {
    return json({ error: 'scope must be organization or project' }, { status: 400 });
  }
  const projectId = scope === 'project' ? url.searchParams.get('projectId') : null;
  if (scope === 'project' && !projectId) {
    return json({ error: 'projectId is required' }, { status: 400 });
  }
  const lookup = await resolveLocation({
    organizationId: url.searchParams.get('organizationId'),
    projectId,
  });
  if (!lookup.ok) return json({ error: lookup.error }, { status: lookup.status });
  return json({ events: await listCatalog(locals, lookup.location) });
}
