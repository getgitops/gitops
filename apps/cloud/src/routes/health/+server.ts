import { json } from '@sveltejs/kit';
import { getServerReadyState } from '$lib/server/server-ready';

export function GET() {
  const state = getServerReadyState();
  const ready = state.status === 'ready';

  return json(
    { status: ready ? 'ok' : 'ko' },
    { status: ready ? 200 : 503 },
  );
}