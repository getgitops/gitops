import { fail, redirect, type Cookies } from '@sveltejs/kit';
import { cancanService } from '#modules/auth';
import {
  SLACK_FLOW_COOKIE,
  SLACK_FLOW_COOKIE_PATH,
  SLACK_FLOW_TTL_MS,
  notificationChannelService,
  slackAppService,
  slackConnectService,
  type ChannelLocation,
} from '#modules/notifications';
import type { AlertLocals } from '#lib/server/alerts/access';
import { CHAT_CHANNEL_TYPES } from '#lib/server/infra/notifications/chat-types';
import type { AppCardData, ChannelTypeOption, ChannelsSectionData } from '#lib/notifications/types';
import {
  canManageChannels,
  createChannel,
  deleteChannel,
  listChannels,
  removeSlackWorkspace,
  rotateChannelSecret,
  startSlackConnection,
  startSlackInstall,
  testChannel,
  updateChannel,
} from './channels';

const SLACK_SETUP_PATH = '/gitops-settings/slack';

/**
 * The integrations and channels of an organization's notification settings; `null` without
 * `organization:notifications:read`, and for projects: channels belong to organizations (#119).
 */
export async function loadChannelsSection(
  locals: AlertLocals,
  location: ChannelLocation,
): Promise<ChannelsSectionData | null> {
  if (location.scope !== 'organization') return null;
  const listed = await listChannels(locals, location);
  if (!listed.ok) return null;
  const [canCreate, canUpdate, canDelete] = await Promise.all([
    canManageChannels(locals, location, 'create'),
    canManageChannels(locals, location, 'update'),
    canManageChannels(locals, location, 'delete'),
  ]);
  const { availableTypes } = listed.data;
  const isAdmin =
    !locals.apiKey &&
    cancanService.canAccessAdminArea(
      locals.user as Parameters<typeof cancanService.canAccessAdminArea>[0],
    );
  return {
    channels: listed.data.channels,
    availableTypes,
    channelTypes: channelTypeOptions(availableTypes),
    apps: [
      await slackAppCard(locals, location.organizationId, { canCreate, canDelete, isAdmin }),
      {
        provider: 'google-chat',
        status: 'coming_soon',
        canInstall: false,
        canRemove: false,
        installations: [],
        setupPath: null,
      },
    ],
    canCreate,
    canUpdate,
    canDelete,
    // Slack channels can only be created with the Slack app configured: "Add to Slack" is there
    slackConnect: canCreate && availableTypes.includes('slack'),
  };
}

/**
 * The "new channel" picker: what can be created, and what is not built yet. A type that is built
 * but switched off (Slack without its app) is not offered at all.
 */
function channelTypeOptions(availableTypes: readonly string[]): ChannelTypeOption[] {
  const registered = notificationChannelService.registeredTypes() as readonly string[];
  return CHAT_CHANNEL_TYPES.flatMap((type): ChannelTypeOption[] =>
    availableTypes.includes(type)
      ? [{ type, status: 'available' }]
      : registered.includes(type)
        ? []
        : [{ type, status: 'coming_soon' }],
  );
}

/**
 * The GitOps Slack app (`/gitops`): disabled until `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and
 * `SLACK_SIGNING_SECRET` are set. Workspaces already connected stay listed and can be removed.
 */
async function slackAppCard(
  locals: AlertLocals,
  organizationId: string,
  input: { canCreate: boolean; canDelete: boolean; isAdmin: boolean },
): Promise<AppCardData> {
  const enabled =
    notificationChannelService.registeredTypes().includes('slack') &&
    slackConnectService.commandsEnabled();
  const installations = (await slackAppService.workspacesOf(organizationId)).map((workspace) => ({
    id: workspace.id,
    name: workspace.teamName,
  }));
  return {
    provider: 'slack',
    status: !enabled ? 'disabled' : installations.length > 0 ? 'installed' : 'available',
    canInstall: enabled && input.canCreate && !locals.apiKey && installations.length === 0,
    canRemove: input.canDelete,
    installations,
    setupPath: !enabled && input.isAdmin ? SLACK_SETUP_PATH : null,
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

/** Form actions of an organization's integrations and channels. */
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

    /** Installs the GitOps Slack app for the organization (`/gitops`): off to Slack. */
    async installSlack(event: ActionEvent) {
      const location = await resolve(event);
      const form = await event.request.formData();
      const result = await startSlackInstall(event.locals, location.organizationId, {
        locale: String(form.get('locale') ?? ''),
        returnTo: String(form.get('returnTo') ?? ''),
        origin: event.url.origin,
      });
      if (location.scope !== 'organization' || !result.ok) {
        return fail(result.ok ? 400 : result.status, {
          channelForm: 'slack-app',
          channelError: result.ok ? 'Forbidden' : result.error,
        });
      }
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

    async removeSlackWorkspace(event: ActionEvent) {
      const location = await resolve(event);
      const form = await event.request.formData();
      const workspaceId = String(form.get('workspaceId') ?? '');
      const result = await removeSlackWorkspace(event.locals, location.organizationId, workspaceId);
      if (location.scope !== 'organization' || !result.ok) {
        return fail(result.ok ? 400 : result.status, {
          channelForm: 'slack-app',
          channelError: result.ok ? 'Forbidden' : result.error,
        });
      }
      return { slackWorkspaceRemoved: workspaceId };
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
