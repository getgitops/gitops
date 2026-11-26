import {
  NotificationChannelNotFoundError,
  NotificationChannelValidationError,
  buildChannelTestMessage,
  notificationChannelService,
  type ChannelInput,
  type ChannelLocation,
  type IssuedChannel,
  type NotificationChannelView,
} from '#modules/notifications';
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
