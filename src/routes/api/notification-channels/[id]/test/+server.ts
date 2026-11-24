import { toResponse } from '#lib/server/alerts/http';
import { testChannel } from '#lib/server/notifications/channels';

// POST /api/notification-channels/<id>/test: posts a test message, even to a disabled channel
export async function POST({ params, locals }) {
  return toResponse(await testChannel(locals, params.id));
}
