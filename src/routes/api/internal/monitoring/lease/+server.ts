import { json } from '@sveltejs/kit';
import { monitoringRuntime } from '#modules/monitoring';
import { badRequest, notReady, parseLeaseRequest } from '#lib/server/monitoring/internal-api';

/** A worker asks for up to `capacity` due checks. Authenticated in `hooks.server.ts`. */
export async function POST({ request }) {
  if (!monitoringRuntime.isStarted) return notReady();
  const lease = await parseLeaseRequest(request);
  if (!lease) return badRequest('Expected { workerId, region?, capacity }');
  return json(await monitoringRuntime.lease(lease));
}
