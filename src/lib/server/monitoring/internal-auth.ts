import { createHash, timingSafeEqual } from 'node:crypto';

export const INTERNAL_MONITORING_PREFIX = '/api/internal/monitoring/';

export function isInternalMonitoringRequest(pathname: string): boolean {
  return pathname.startsWith(INTERNAL_MONITORING_PREFIX);
}

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Checks a request to the internal worker API. Returns the error response, or `null` when it may
 * go on.
 *
 * - Without `MONITORING_WORKER_TOKEN` the API does not exist (404).
 * - With `MONITORING_INTERNAL_HOSTS`, only those Host headers are served, so the API can't be
 *   reached through the public domain even with the token. The raw header is used on purpose:
 *   `event.url` is pinned to `ORIGIN`.
 * - The bearer token is compared in constant time.
 */
export function verifyWorkerRequest(
  request: Request,
  config: { workerToken: string | null; internalHosts: string[] },
): Response | null {
  if (!config.workerToken) return json(404, 'Not found');

  if (config.internalHosts.length > 0) {
    const host = (request.headers.get('host') ?? '').trim().toLowerCase();
    if (!config.internalHosts.includes(host)) return json(404, 'Not found');
  }

  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim() ?? '';
  if (!token || !timingSafeEqual(digest(token), digest(config.workerToken))) {
    return json(401, 'Invalid worker token');
  }
  return null;
}
