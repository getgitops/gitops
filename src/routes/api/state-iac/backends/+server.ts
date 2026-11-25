import { json } from '@sveltejs/kit';
import { readJson, toResponse } from '#lib/server/alerts/http';
import {
  backendInputFrom,
  createBackend,
  listBackends,
  resolveOrganization,
} from '#lib/server/state-iac/backends';

// GET /api/state-iac/backends?organizationId=…: the organization's backends. Credentials are never
// returned, only `hasCredentials`
export async function GET({ url, locals }) {
  const organization = await resolveOrganization(url.searchParams.get('organizationId'));
  if (!organization.ok) return json({ error: organization.error }, { status: organization.status });
  return toResponse(await listBackends(locals, organization.data.organizationId));
}

// POST /api/state-iac/backends { organizationId, name, provider, bucket, prefix?, region?,
// endpoint?, forcePathStyle?, auth, credentials?: { serviceAccountJson } | { accessKeyId,
// secretAccessKey, sessionToken? }, enabled? }
export async function POST({ request, locals }) {
  const body = await readJson(request);
  const organization = await resolveOrganization(body.organizationId);
  if (!organization.ok) return json({ error: organization.error }, { status: organization.status });
  return toResponse(
    await createBackend(locals, organization.data.organizationId, backendInputFrom(body)),
  );
}
