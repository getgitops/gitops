import {
  NotificationChannelNotFoundError,
  NotificationChannelValidationError,
  SLACK_CALLBACK_PATH,
  SlackConnectError,
  buildChannelTestMessage,
  notificationChannelService,
  slackAppService,
  slackConnectService,
  type ChannelInput,
  type ChannelLocation,
  type IssuedChannel,
  type NotificationChannelView,
  type SlackFlowResult,
} from '#modules/notifications';
import { authService } from '#modules/auth';
import { runWithActor } from '#lib/server/request-context';
import { organizationService } from '#modules/organization';
import { projectService } from '#modules/projects';
import { absoluteUrl, type ChatChannelType } from '#lib/server/infra/notifications';
import { actorFor, callerCan, contextOf, type AlertLocals } from '#lib/server/alerts/access';

export type ChannelAction = 'read' | 'create' | 'update' | 'delete';

/** Outcome of a channel operation, mapped to JSON by the API and to `fail()` by form actions. */
export type ChannelResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; errors?: Record<string, string> };

const forbidden = { ok: false as const, status: 403, error: 'Forbidden' };
const notFound = { ok: false as const, status: 404, error: 'Channel not found' };

/** `<scope>:notifications:<action>` in the channel's (or the page's) location. */
export function canManageChannels(
  locals: AlertLocals,
  location: ChannelLocation,
  action: ChannelAction,
): Promise<boolean> {
  return callerCan(locals, `${location.scope}:notifications:${action}`, contextOf(location));
}

function failure(error: unknown): ChannelResult<never> {
  if (error instanceof NotificationChannelValidationError) {
    return { ok: false, status: 400, error: 'Invalid channel', errors: error.errors };
  }
  if (error instanceof NotificationChannelNotFoundError) return notFound;
  throw error;
}

async function loadAuthorized(locals: AlertLocals, id: string, action: ChannelAction) {
  const channel = await notificationChannelService.get(id).catch(() => null);
  if (!channel) return notFound;
  // a channel the caller can't read is indistinguishable from a missing one
  if (!(await canManageChannels(locals, channel.location, 'read'))) return notFound;
  if (action !== 'read' && !(await canManageChannels(locals, channel.location, action))) {
    return forbidden;
  }
  return { ok: true as const, status: 200, data: channel };
}

export type ChannelList = {
  channels: NotificationChannelView[];
  /** Organization channels a project's alerts can also use (project locations only). */
  inherited: NotificationChannelView[];
  /** Types that can be created now (a transport is registered for them). */
  availableTypes: ChatChannelType[];
};

export async function listChannels(
  locals: AlertLocals,
  location: ChannelLocation,
): Promise<ChannelResult<ChannelList>> {
  if (!(await canManageChannels(locals, location, 'read'))) return forbidden;
  const own = await notificationChannelService.list(location);
  const inherited =
    location.scope === 'project'
      ? await notificationChannelService.list({
          organizationId: location.organizationId,
          projectId: null,
        })
      : [];
  return {
    ok: true,
    status: 200,
    data: {
      channels: own.map((channel) => notificationChannelService.toView(channel)),
      inherited: inherited.map((channel) => notificationChannelService.toView(channel)),
      availableTypes: notificationChannelService.availableTypes(),
    },
  };
}

export async function getChannel(
  locals: AlertLocals,
  id: string,
): Promise<ChannelResult<NotificationChannelView>> {
  const loaded = await loadAuthorized(locals, id, 'read');
  return loaded.ok
    ? { ok: true, status: 200, data: notificationChannelService.toView(loaded.data) }
    : loaded;
}

/**
 * A channel and, for signed types, its signing secret in clear. Only the create and rotate
 * responses carry it: it is never readable again.
 */
export type ChannelWithSecret = NotificationChannelView & { signingSecret?: string };

function withSecret(issued: IssuedChannel): ChannelWithSecret {
  const view = notificationChannelService.toView(issued.channel);
  return issued.signingSecret ? { ...view, signingSecret: issued.signingSecret } : view;
}

export async function createChannel(
  locals: AlertLocals,
  location: ChannelLocation,
  input: ChannelInput,
): Promise<ChannelResult<ChannelWithSecret>> {
  if (!(await canManageChannels(locals, location, 'create'))) return forbidden;
  const actor = actorFor(locals);
  if (!actor) return forbidden;
  try {
    const issued = await notificationChannelService.create(location, input, actor.userId);
    return { ok: true, status: 201, data: withSecret(issued) };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Generates a new signing secret (the previous one keeps signing for 24 h) and returns it, this
 * one time, in clear. Needs `<scope>:notifications:update`.
 */
export async function rotateChannelSecret(
  locals: AlertLocals,
  id: string,
): Promise<ChannelResult<ChannelWithSecret>> {
  const loaded = await loadAuthorized(locals, id, 'update');
  if (!loaded.ok) return loaded;
  try {
    return {
      ok: true,
      status: 200,
      data: withSecret(await notificationChannelService.rotateSecret(id)),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateChannel(
  locals: AlertLocals,
  id: string,
  input: ChannelInput,
): Promise<ChannelResult<NotificationChannelView>> {
  const loaded = await loadAuthorized(locals, id, 'update');
  if (!loaded.ok) return loaded;
  try {
    // the type can't change: a different provider is a different channel
    const { type: _type, ...changes } = input;
    void _type;
    const channel = await notificationChannelService.update(id, changes);
    return { ok: true, status: 200, data: notificationChannelService.toView(channel) };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteChannel(
  locals: AlertLocals,
  id: string,
): Promise<ChannelResult<{ id: string }>> {
  const loaded = await loadAuthorized(locals, id, 'delete');
  if (!loaded.ok) return loaded;
  try {
    await notificationChannelService.delete(id);
    return { ok: true, status: 200, data: { id } };
  } catch (error) {
    return failure(error);
  }
}

/** Names and settings path of a channel's location, for the test message. */
async function describeLocation(location: ChannelLocation) {
  const organization = await organizationService
    .getOrganization(location.organizationId)
    .catch(() => null);
  const project = location.projectId
    ? await projectService.getProject(location.projectId).catch(() => null)
    : null;
  const where = project?.name ?? organization?.name ?? 'GitOps';
  const path =
    organization && project
      ? `/org/${organization.slug}/projects/${project.slug}/settings/notifications`
      : organization
        ? `/org/${organization.slug}/settings/notifications`
        : null;
  return { where, link: absoluteUrl(path) };
}

/** "Send test message": posts a test to the channel, even a disabled one, and tells the result. */
export async function testChannel(
  locals: AlertLocals,
  id: string,
): Promise<ChannelResult<{ sent: boolean; error: string | null }>> {
  const loaded = await loadAuthorized(locals, id, 'update');
  if (!loaded.ok) return loaded;
  const channel = loaded.data;
  const { where, link } = await describeLocation(channel.location);
  const result = await notificationChannelService.test(
    id,
    buildChannelTestMessage({ channelName: channel.name, where, link }, channel.locale),
  );
  return { ok: true, status: 200, data: result };
}

/** Redirect URL of "Add to Slack" for the origin the browser is on (registered in the Slack app). */
export function slackRedirectUri(origin: string): string {
  return `${origin}${SLACK_CALLBACK_PATH}`;
}

/**
 * Starts "Add to Slack" for a channel of `location`: needs a signed-in user (not an API key) with
 * `<scope>:notifications:create`. Returns where to send the browser and the flow cookie to set.
 */
export async function startSlackConnection(
  locals: AlertLocals,
  location: ChannelLocation,
  input: { locale: unknown; returnTo: unknown; origin: string },
): Promise<ChannelResult<{ authorizationUrl: string; flowCookie: string }>> {
  const userId = locals.apiKey ? null : locals.user?.id;
  if (!userId || !(await canManageChannels(locals, location, 'create'))) return forbidden;
  try {
    return {
      ok: true,
      status: 303,
      data: slackConnectService.start({
        userId,
        location,
        locale: input.locale,
        returnTo: input.returnTo,
        redirectUri: slackRedirectUri(input.origin),
      }),
    };
  } catch (error) {
    if (error instanceof SlackConnectError) return { ok: false, status: 400, error: error.code };
    throw error;
  }
}

/**
 * Starts installing the GitOps Slack app in a workspace for an organization (`/gitops`): needs a
 * signed-in user with `organization:notifications:create`.
 */
export async function startSlackInstall(
  locals: AlertLocals,
  organizationId: string,
  input: { locale: unknown; returnTo: unknown; origin: string },
): Promise<ChannelResult<{ authorizationUrl: string; flowCookie: string }>> {
  const location: ChannelLocation = { scope: 'organization', organizationId, projectId: null };
  const userId = locals.apiKey ? null : locals.user?.id;
  if (!userId || !(await canManageChannels(locals, location, 'create'))) return forbidden;
  if (!slackConnectService.commandsEnabled()) {
    return { ok: false, status: 400, error: 'slack_not_configured' };
  }
  try {
    return {
      ok: true,
      status: 303,
      data: slackConnectService.startInstall({
        userId,
        organizationId,
        locale: input.locale,
        returnTo: input.returnTo,
        redirectUri: slackRedirectUri(input.origin),
      }),
    };
  } catch (error) {
    if (error instanceof SlackConnectError) return { ok: false, status: 400, error: error.code };
    throw error;
  }
}

/** Forgets a Slack workspace of the organization (`organization:notifications:delete`). */
export async function removeSlackWorkspace(
  locals: AlertLocals,
  organizationId: string,
  workspaceId: string,
): Promise<ChannelResult<{ id: string }>> {
  const location: ChannelLocation = { scope: 'organization', organizationId, projectId: null };
  if (!(await canManageChannels(locals, location, 'delete'))) return forbidden;
  const removed = await slackAppService.removeWorkspace(organizationId, workspaceId);
  return removed
    ? { ok: true, status: 200, data: { id: workspaceId } }
    : { ok: false, status: 404, error: 'Workspace not found' };
}

/** Where the callback sends the browser, and the error code to log when it failed. */
export type SlackFlowOutcome = { location: string; error: string | null };

function withStatus(path: string, status: string, extra: Record<string, string> = {}) {
  return `${path}?${new URLSearchParams({ slack: status, ...extra })}`;
}

/** The first validation error of a failed create, as a `notifications.errors.*` code. */
function createError(result: { status: number; errors?: Record<string, string> }): string {
  return result.status === 403
    ? 'Forbidden'
    : (Object.values(result.errors ?? {})[0] ?? 'slack_exchange_failed');
}

/**
 * Finishes a Slack OAuth flow, whichever started it:
 * - "Add to Slack" on a channels page: creates the channel (same session, permission again);
 * - the app install: saves the workspace for the organization (same session, permission again);
 * - `/gitops channel`: creates the channel named in Slack as the linked user (no session needed,
 *   the flow is bound to the Slack workspace and user), posts a test message to it, and ends on
 *   the "go back to Slack" page.
 */
export async function completeSlackFlow(
  locals: AlertLocals,
  input: { flowCookie: string | undefined; searchParams: URLSearchParams; origin: string },
): Promise<SlackFlowOutcome> {
  const sessionUserId = locals.apiKey ? null : (locals.user?.id ?? null);
  let result: SlackFlowResult;
  try {
    result = await slackConnectService.complete({
      flowCookie: input.flowCookie,
      sessionUserId,
      state: input.searchParams.get('state'),
      code: input.searchParams.get('code'),
      error: input.searchParams.get('error'),
      redirectUri: slackRedirectUri(input.origin),
    });
  } catch (error) {
    if (error instanceof SlackConnectError) {
      return { location: withStatus(error.returnTo, error.code), error: error.code };
    }
    throw error;
  }

  if (result.kind === 'install') {
    const location: ChannelLocation = {
      scope: 'organization',
      organizationId: result.organizationId,
      projectId: null,
    };
    if (!(await canManageChannels(locals, location, 'create'))) {
      return { location: withStatus(result.returnTo, 'Forbidden'), error: 'Forbidden' };
    }
    const installed = await slackAppService.installWorkspace(result);
    const status = installed === 'installed' ? 'installed' : 'slack_workspace_taken';
    return {
      location: withStatus(result.returnTo, status),
      error: installed === 'installed' ? null : status,
    };
  }

  if (result.kind === 'channel') {
    const created = await createChannel(locals, result.location, {
      type: 'slack',
      name: result.name,
      destination: result.webhookUrl,
      locale: result.locale,
      enabled: true,
    });
    if (!created.ok) {
      const code = createError(created);
      return { location: withStatus(result.returnTo, code), error: code };
    }
    return { location: withStatus(result.returnTo, 'connected'), error: null };
  }

  // from Slack: act as the linked user, who must still exist, be enabled and hold the permission
  const user = await authService.sessionUserById(result.userId);
  if (!user || user.disabled) {
    return { location: withStatus(result.returnTo, 'Forbidden'), error: 'Forbidden' };
  }
  const userLocals: AlertLocals = { user };
  const actor = {
    name: user.username,
    email: user.email || `${user.username}@gitops.local`,
    userId: user.id,
  };
  return runWithActor(actor, async () => {
    const created = await createChannel(userLocals, result.location, {
      type: 'slack',
      name: result.name,
      destination: result.webhookUrl,
      locale: result.locale,
      enabled: true,
    });
    if (!created.ok) {
      const code = createError(created);
      return { location: withStatus(result.returnTo, code), error: code };
    }
    // the channel says hello: the user sees in Slack that it works
    await testChannel(userLocals, created.data.id).catch(() => undefined);
    const extra: Record<string, string> = { team: result.teamId, name: result.name };
    if (result.channelId) extra.channel = result.channelId;
    return { location: withStatus(result.returnTo, 'connected', extra), error: null };
  });
}
