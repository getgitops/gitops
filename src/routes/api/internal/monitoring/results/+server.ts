import { json } from '@sveltejs/kit';
import { monitoringRuntime } from '#modules/monitoring';
import { badRequest, notReady, parseReportRequest } from '#lib/server/monitoring/internal-api';

/** A worker reports finished checks. Authenticated in `hooks.server.ts`. */
export async function POST({ request }) {
  if (!monitoringRuntime.isStarted) return notReady();
  const report = await parseReportRequest(request);
  if (!report) return badRequest('Expected { workerId, region?, results: [...] }');
  return json(await monitoringRuntime.report(report));
}
