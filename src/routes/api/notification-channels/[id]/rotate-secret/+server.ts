import { toResponse } from '#lib/server/alerts/http';
import { rotateChannelSecret } from '#lib/server/notifications/channels';

// POST /api/notification-channels/<id>/rotate-secret: new signing secret, returned this one time
// (`signingSecret`); the previous one keeps signing next to it for 24 h
export async function POST({ params, locals }) {
  return toResponse(await rotateChannelSecret(locals, params.id));
}
