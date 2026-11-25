import { readJson, toResponse } from '#lib/server/alerts/http';
import { deleteChannel, getChannel, updateChannel } from '#lib/server/notifications/channels';

export async function GET({ params, locals }) {
  return toResponse(await getChannel(locals, params.id));
}

// PATCH /api/notification-channels/<id> { name?, destination?, enabled? }: the type can't change and
// an omitted destination keeps the stored one
export async function PATCH({ params, request, locals }) {
  const body = await readJson(request);
  return toResponse(
    await updateChannel(locals, params.id, {
      name: body.name,
      destination: body.destination,
      enabled: body.enabled,
    }),
  );
}

export async function DELETE({ params, locals }) {
  return toResponse(await deleteChannel(locals, params.id));
}
