/**
 * SvelteKit's CSRF origin check, done here instead of by the framework (`csrf.trustedOrigins:
 * ['*']` in `vite.config.ts`) so a few routes can be exempt: Slack posts its commands and forms
 * as `application/x-www-form-urlencoded` without an `Origin` header, which SvelteKit would refuse
 * in production. Those routes authenticate every request with Slack's HMAC signature instead.
 */

const FORM_CONTENT_TYPES = [
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
  // what `enhance` sends for forms with files
  'application/x-sveltekit-formdata',
];
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Routes that verify their own signed requests (`X-Slack-Signature`), and nothing else. */
export const CSRF_EXEMPT_PATHS = new Set(['/api/slack/commands', '/api/slack/interactions']);

function isFormContentType(header: string | null): boolean {
  const type = header?.split(';', 1)[0].trim().toLowerCase() ?? '';
  return FORM_CONTENT_TYPES.includes(type);
}

/** Same rule as SvelteKit's `is_csrf_forbidden` (no trusted origins), plus the exempt paths. */
export function isCsrfForbidden(request: Request, url: URL): boolean {
  if (CSRF_EXEMPT_PATHS.has(url.pathname)) return false;
  const contentType = request.headers.get('content-type');
  return (
    (!contentType || isFormContentType(contentType)) &&
    MUTATING_METHODS.has(request.method) &&
    request.headers.get('origin') !== url.origin
  );
}

export function csrfForbiddenResponse(request: Request): Response {
  const message = `Cross-site ${request.method} form submissions are forbidden`;
  if (request.headers.get('accept') === 'application/json') {
    return Response.json({ message }, { status: 403 });
  }
  return new Response(message, { status: 403, headers: { 'content-type': 'text/plain' } });
}
