import { json } from '@sveltejs/kit';
import type { AlertResult } from './operations';

/** JSON response for an alert operation: `{ data }` on success, `{ error, errors? }` otherwise. */
export function toResponse<T>(result: AlertResult<T>): Response {
  if (result.ok) return json(result.data, { status: result.status });
  return json(
    result.errors ? { error: result.error, errors: result.errors } : { error: result.error },
    { status: result.status },
  );
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}
