import { fail, redirect, type Cookies } from '@sveltejs/kit';
import { cancanService } from '#modules/auth';
import {
  SLACK_FLOW_COOKIE,
  SLACK_FLOW_COOKIE_PATH,
  SLACK_FLOW_TTL_MS,
  slackConnectService,
  type ChannelLocation,
} from '#modules/notifications';
import type { AlertLocals } from '#lib/server/alerts/access';
import type { ChannelsSectionData } from '#lib/notifications/types';
import {
  canManageChannels,
  createChannel,
  deleteChannel,
  listChannels,
  rotateChannelSecret,
  startSlackConnection,
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
  const slackAvailable = listed.data.availableTypes.includes('slack');
  const slackConfigured = slackConnectService.isConfigured();
  const isAdmin =
    !locals.apiKey &&
    cancanService.canAccessAdminArea(
      locals.user as Parameters<typeof cancanService.canAccessAdminArea>[0],
    );
  return {
    ...listed.data,
    scope: location.scope,
    canCreate,
    canUpdate,
    canDelete,
    // "Add to Slack" only when the app is configured and Slack channels can be created
    slackConnect: canCreate && slackAvailable && slackConfigured,
    // without the app, GitOps admins get a link to set it up from the Slack card
    slackSetupPath:
      canCreate && slackAvailable && !slackConfigured && isAdmin ? '/gitops-settings/slack' : null,
  };
}

type ActionEvent = {
  request: Request;
  params: Record<string, string>;
  locals: AlertLocals;
  url: URL;
  cookies: Cookies;
};

const SLACK_AUTHORIZATION_ORIGIN = 'https://slack.com';

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
        locale: String(form.get('locale') ?? ''),
        enabled: true,
      };
      const result = await createChannel(event.locals, location, input);
      if (!result.ok) {
        // the destination is never echoed back: it has to be typed again
        return fail(result.status, {
          channelForm: 'create',
          channelDraft: { type: input.type, name: input.name, locale: input.locale },
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

    /**
     * "Add to Slack": a plain (non-enhanced) form posts here and the browser follows the redirect
     * to Slack; the channel is created by `/notifications/slack/callback`.
     */
    async connectSlack(event: ActionEvent) {
      const location = await resolve(event);
      const form = await event.request.formData();
      const result = await startSlackConnection(event.locals, location, {
        locale: String(form.get('locale') ?? ''),
        returnTo: String(form.get('returnTo') ?? ''),
        origin: event.url.origin,
      });
      if (!result.ok) {
        return fail(result.status, { channelForm: 'slack', channelError: result.error });
      }
      // sameSite lax: Slack's redirect back is a top-level GET navigation, so the cookie travels
      event.cookies.set(SLACK_FLOW_COOKIE, result.data.flowCookie, {
        path: SLACK_FLOW_COOKIE_PATH,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SLACK_FLOW_TTL_MS / 1000,
      });
      throw redirect(303, result.data.authorizationUrl, {
        external: [SLACK_AUTHORIZATION_ORIGIN],
      });
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
        locale: String(form.get('locale') ?? ''),
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
