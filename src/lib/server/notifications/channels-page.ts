import { fail } from '@sveltejs/kit';
import type { ChannelLocation } from '#modules/notifications';
import type { AlertLocals } from '#lib/server/alerts/access';
import type { ChannelsSectionData } from '#lib/notifications/types';
import {
  canManageChannels,
  createChannel,
  deleteChannel,
  listChannels,
  rotateChannelSecret,
  testChannel,
  updateChannel,
} from './channels';

/** The channels section of a notifications page; `null` without `<scope>:notifications:read`. */
export async function loadChannelsSection(
  locals: AlertLocals,
  location: ChannelLocation,
): Promise<ChannelsSectionData | null> {
  const listed = await listChannels(locals, location);
  if (!listed.ok) return null;
  const [canCreate, canUpdate, canDelete] = await Promise.all([
    canManageChannels(locals, location, 'create'),
    canManageChannels(locals, location, 'update'),
    canManageChannels(locals, location, 'delete'),
  ]);
  return { ...listed.data, scope: location.scope, canCreate, canUpdate, canDelete };
}

type ActionEvent = { request: Request; params: Record<string, string>; locals: AlertLocals };

/** Form actions of the channels section, shared by the organization and project pages. */
export function channelActions(resolve: (event: ActionEvent) => Promise<ChannelLocation>) {
  return {
    async createChannel(event: ActionEvent) {
      const location = await resolve(event);
      const form = await event.request.formData();
      const input = {
        type: String(form.get('type') ?? ''),
        name: String(form.get('name') ?? ''),
        destination: String(form.get('destination') ?? ''),
        enabled: true,
      };
      const result = await createChannel(event.locals, location, input);
      if (!result.ok) {
        // the destination is never echoed back: it has to be typed again
        return fail(result.status, {
          channelForm: 'create',
          channelDraft: { type: input.type, name: input.name },
          channelError: result.error,
          channelErrors: result.errors ?? {},
        });
      }
      // the signing secret is shown this once: the page renders it from the action result
      return {
        channelSaved: result.data.id,
        ...(result.data.signingSecret
          ? { channelSecret: { channelId: result.data.id, secret: result.data.signingSecret } }
          : {}),
      };
    },

    async rotateChannelSecret(event: ActionEvent) {
      await resolve(event);
      const form = await event.request.formData();
      const channelId = String(form.get('channelId') ?? '');
      const result = await rotateChannelSecret(event.locals, channelId);
      if (!result.ok || !result.data.signingSecret) {
        return fail(result.ok ? 400 : result.status, {
          channelForm: channelId,
          channelError: result.ok ? 'not_signed' : result.error,
        });
      }
      return {
        channelSaved: channelId,
        channelSecret: { channelId, secret: result.data.signingSecret, rotated: true },
      };
    },

    async updateChannel(event: ActionEvent) {
      await resolve(event);
      const form = await event.request.formData();
      const channelId = String(form.get('channelId') ?? '');
      const result = await updateChannel(event.locals, channelId, {
        name: String(form.get('name') ?? ''),
        destination: String(form.get('destination') ?? ''),
      });
      if (!result.ok) {
        return fail(result.status, {
          channelForm: channelId,
          channelError: result.error,
          channelErrors: result.errors ?? {},
        });
      }
      return { channelSaved: channelId };
    },

    async toggleChannel(event: ActionEvent) {
      await resolve(event);
      const form = await event.request.formData();
      const channelId = String(form.get('channelId') ?? '');
      const result = await updateChannel(event.locals, channelId, {
        enabled: form.get('enabled') === 'true',
      });
      if (!result.ok)
        return fail(result.status, { channelForm: channelId, channelError: result.error });
      return { channelSaved: channelId };
    },

    async deleteChannel(event: ActionEvent) {
      await resolve(event);
      const form = await event.request.formData();
      const channelId = String(form.get('channelId') ?? '');
      const result = await deleteChannel(event.locals, channelId);
      if (!result.ok)
        return fail(result.status, { channelForm: channelId, channelError: result.error });
      return { channelDeleted: channelId };
    },

    async testChannel(event: ActionEvent) {
      await resolve(event);
      const form = await event.request.formData();
      const channelId = String(form.get('channelId') ?? '');
      const result = await testChannel(event.locals, channelId);
      if (!result.ok)
        return fail(result.status, { channelForm: channelId, channelError: result.error });
      return { channelTest: { channelId, ...result.data } };
    },
  };
}
