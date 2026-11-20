import { error, fail } from '@sveltejs/kit';
import type { RequestEvent } from './$types';

type Locals = RequestEvent['locals'];
import { apiKeysService, cancanService, roleService, userAccessService } from '#modules/auth';
import { codeReportService } from '#modules/code-report';
import { projectService } from '#modules/projects';
import { listAlertableEvents } from '#lib/events/catalog';
import type { EventType } from '#lib/events/domain-events';
import { organizationService } from '#modules/organization';
import { eventLog } from '#lib/server/events';
import { readEventsExpirationMs } from '#lib/server/events/config';
import {
  EVENT_MODULES,
  createEventVisibility,
  parseModuleFilter,
  parseStatusFilter,
  toEventView,
  type EventView,
} from './event-view';

const PAGE_SIZE = 200;

function canEvents(locals: Locals, organizationId: string, action: 'read' | 'update') {
  return cancanService.canSessionUser(locals.user, `organization:events:${action}`, {
    scope: 'organization',
    organizationId,
  });
}

function visibilityFor(locals: Locals, organizationId: string) {
  return createEventVisibility(organizationId, (permission, context) =>
    cancanService.canSessionUser(locals.user, permission, context),
  );
}

export async function load({ parent, locals, url }) {
  const { organization } = await parent();
  if (!(await canEvents(locals, organization.id, 'read'))) {
    throw error(403, 'Forbidden');
  }
  const canAck = await canEvents(locals, organization.id, 'update');

  const module = parseModuleFilter(url.searchParams.get('module'));
  const status = parseStatusFilter(url.searchParams.get('status'));
  const types = module
    ? (listAlertableEvents({ module }).map((definition) => definition.type) as EventType[])
    : undefined;

  const isVisible = visibilityFor(locals, organization.id);
  const candidates = eventLog.list({
    organizationId: organization.id,
    types,
    acked: status === 'all' ? undefined : status === 'acked',
  });

  const visible = [];
  for (const entry of candidates) {
    if (await isVisible(entry)) visible.push(entry);
    if (visible.length >= PAGE_SIZE) break;
  }

  const projects = await projectService.listProjectsByOrganization(organization.id);
  // names for the ids events carry; a failed lookup only leaves the raw id on screen
  const perProject = <T>(read: (projectId: string) => Promise<T[]>) =>
    Promise.all(projects.map((project) => read(project.id).catch(() => [] as T[]))).then((rows) =>
      rows.flat(),
    );
  const [users, apiKeys, services, roles] = await Promise.all([
    userAccessService.listAssignableUsers(),
    perProject((projectId) => apiKeysService.listActiveApiKeysByProject(projectId)),
    perProject((projectId) => codeReportService.listByProject(projectId)),
    Promise.all([
      roleService.listRoles('organization', organization.id).catch(() => []),
      perProject((projectId) => roleService.listRoles('project', projectId)),
    ]).then((rows) => rows.flat()),
  ]);

  const lookups = {
    usernames: new Map<string, string>(users.map((user) => [user.id, user.username])),
    projectNames: new Map(projects.map((project) => [project.id, project.name])),
    apiKeyNames: new Map(apiKeys.map((key) => [key.id, key.name])),
    serviceNames: new Map(services.map((service) => [service.id, service.name])),
    roleNames: new Map<string, string>(roles.map((role) => [role.id, role.name])),
  };

  return {
    orgSlug: organization.slug,
    events: visible.map((entry) => toEventView(entry, lookups)).filter((e): e is EventView => !!e),
    filters: { module, status },
    canAck,
    modules: EVENT_MODULES,
    retentionMs: readEventsExpirationMs(),
  };
}

export const actions = {
  async ack({ request, locals, params }) {
    const organization = await organizationService.tryFindBySlug(params.org);
    if (!organization) return fail(404, { error: 'Organization not found' });

    const user = locals.user;
    if (!user || !(await canEvents(locals, organization.id, 'update'))) {
      return fail(403, { error: 'Forbidden' });
    }

    const form = await request.formData();
    const eventId = String(form.get('eventId') ?? '');
    const entry = eventLog.get(eventId);

    // an expired or foreign event is indistinguishable from one the viewer cannot see
    if (!entry || !(await visibilityFor(locals, organization.id)(entry))) {
      return fail(404, { error: 'Event not found' });
    }

    eventLog.ack(eventId, { userId: user.id, username: user.username });
    return { success: true };
  },
};
