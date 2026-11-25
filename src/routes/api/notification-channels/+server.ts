import { json } from '@sveltejs/kit';
import { resolveLocation } from '#lib/server/alerts/access';
import { readJson, toResponse } from '#lib/server/alerts/http';
import { createChannel, listChannels } from '#lib/server/notifications/channels';

// GET /api/notification-channels?organizationId=…|projectId=…: the location's channels (and, for a
// project, the organization ones it inherits). The destination is only ever returned masked
export async function GET({ url, locals }) {
  const lookup = await resolveLocation({
    organizationId: url.searchParams.get('organizationId'),
    projectId: url.searchParams.get('projectId'),
  });
  if (!lookup.ok) return json({ error: lookup.error }, { status: lookup.status });
  return toResponse(await listChannels(locals, lookup.location));
}

// POST /api/notification-channels { organizationId | projectId, type, name, destination, enabled? }
export async function POST({ request, locals }) {
  const body = await readJson(request);
  const lookup = await resolveLocation({
    organizationId: typeof body.organizationId === 'string' ? body.organizationId : null,
    projectId: typeof body.projectId === 'string' ? body.projectId : null,
  });
  if (!lookup.ok) return json({ error: lookup.error }, { status: lookup.status });
  return toResponse(
    await createChannel(locals, lookup.location, {
      type: body.type,
      name: body.name,
      destination: body.destination,
      enabled: body.enabled,
    }),
  );
}
