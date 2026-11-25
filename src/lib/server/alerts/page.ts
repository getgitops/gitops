import { error, fail, redirect } from '@sveltejs/kit';
import {
  alertDirectory,
  alertService,
  isMailConfigured,
  type AlertLocation,
  type AlertRow,
} from '#modules/alerts';
import {
  ALERT_CHANNELS,
  emptyRecipients,
  type AlertChannel,
} from '#modules/alerts/domain/alert.domain';
import { externalRecipientService, notificationSettingsService } from '#modules/notifications';
import { organizationService } from '#modules/organization';
import { projectService } from '#modules/projects';
import {
  getEventDefinition,
  isEventType,
  listAlertFields,
  type EventDefinition,
  type FieldReference,
} from '#lib/events/catalog';
import type {
  AlertDraft,
  AlertEditorData,
  AlertListData,
  AlertOption,
  DraftCondition,
  ExternalRecipientsEditorData,
} from '#lib/alerts/types';
import {
  canOpenNotificationSettings,
  loadNotificationSettings,
} from '#lib/server/notifications/settings';
import { callerCan, canManageAlerts, contextOf, type AlertLocals } from './access';
import {
  createAlert,
  deleteAlert,
  listAlerts,
  listCatalog,
  testDraftAlert,
  updateAlert,
  type CatalogEntry,
} from './operations';

/** Where the pages of a location live and how they link back. */
export type AlertPageContext = {
  location: AlertLocation;
  /** `/org/<org>/settings/alerts` or `/org/<org>/projects/<slug>/settings/alerts` */
  basePath: string;
};

async function permissions(locals: AlertLocals, location: AlertLocation) {
  const [canRead, canCreate, canUpdate, canDelete] = await Promise.all([
    canManageAlerts(locals, location, 'read'),
    canManageAlerts(locals, location, 'create'),
    canManageAlerts(locals, location, 'update'),
    canManageAlerts(locals, location, 'delete'),
  ]);
  return { canRead, canCreate, canUpdate, canDelete };
}

/** Options for every reference the catalog fields use, all inside the location. */
async function referenceOptions(
  catalog: CatalogEntry[],
  location: AlertLocation,
): Promise<Record<string, AlertOption[]>> {
  const references = new Set<FieldReference>();
  for (const definition of catalog) {
    for (const field of definition.fields) if (field.reference) references.add(field.reference);
  }
  const entries = await Promise.all(
    [...references].map(
      async (reference) =>
        [
          reference,
          await alertDirectory.listReferences(reference, location).catch(() => []),
        ] as const,
    ),
  );
  return Object.fromEntries(
    entries.map(([reference, options]) => [
      reference,
      options.map((option) => ({ id: option.id, label: option.label })),
    ]),
  );
}

async function recipientOptions(location: AlertLocation) {
  const [members, roles] = await Promise.all([
    alertDirectory.listMembers(location).catch(() => []),
    alertDirectory.listRoles(location).catch(() => []),
  ]);
  return {
    users: members
      .filter((member) => !member.disabled)
      .map((member) => ({
        id: member.userId,
        label: member.username,
        ...(member.email ? { hint: member.email } : {}),
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    roles: roles.map((role) => ({ id: role.id, label: role.name })),
  };
}

async function externalRecipientsData(
  locals: AlertLocals,
  location: AlertLocation,
  emails: string[],
): Promise<ExternalRecipientsEditorData> {
  const [canManage, settings, statuses, canOpenSettings, organization] = await Promise.all([
    callerCan(locals, `${location.scope}:notifications:update`, contextOf(location)),
    notificationSettingsService.get(location.organizationId).catch(() => null),
    externalRecipientService
      .statuses(location.organizationId, [...new Set(emails)])
      .catch(() => new Map<string, string>()),
    canOpenNotificationSettings(locals, location.organizationId),
    organizationService.getOrganization(location.organizationId).catch(() => null),
  ]);
  return {
    canManage,
    allowedDomains: settings?.allowedExternalEmailDomains ?? [],
    statuses: Object.fromEntries(statuses),
    settingsPath:
      canOpenSettings && organization ? `/org/${organization.slug}/settings/alerts/settings` : null,
  };
}

export async function loadAlertList(
  locals: AlertLocals,
  context: AlertPageContext,
): Promise<AlertListData> {
  const { location } = context;
  const allowed = await permissions(locals, location);
  if (!allowed.canRead) throw error(403, 'Forbidden');

  const listed = await listAlerts(locals, location);
  if (!listed.ok) throw error(listed.status, listed.error);

  // the organization catalog knows every event the inherited alerts may watch
  const catalog = await listCatalog(locals, location);
  const inheritedCatalog =
    location.scope === 'project'
      ? await listCatalog(locals, { ...location, scope: 'organization', projectId: null })
      : [];
  const organizationLocation: AlertLocation = {
    ...location,
    scope: 'organization',
    projectId: null,
  };
  const [references, own, organizationRecipients, external] = await Promise.all([
    referenceOptions([...catalog, ...inheritedCatalog], organizationLocation),
    recipientOptions(location),
    location.scope === 'project' ? recipientOptions(organizationLocation) : null,
    externalRecipientsData(
      locals,
      location,
      listed.data.alerts.flatMap((alert) => alert.recipients.emails ?? []),
    ),
  ]);
  // names for the recipients of the location's alerts and of the inherited organization ones
  const merge = (a: AlertOption[], b: AlertOption[] = []) => [
    ...a,
    ...b.filter((option) => !a.some((existing) => existing.id === option.id)),
  ];
  const recipients = {
    users: merge(own.users, organizationRecipients?.users),
    roles: merge(own.roles, organizationRecipients?.roles),
  };

  return {
    basePath: context.basePath,
    scope: location.scope,
    alerts: listed.data.alerts,
    inherited: listed.data.inherited,
    catalog: [
      ...catalog,
      ...inheritedCatalog.filter((entry) => !catalog.some((c) => c.type === entry.type)),
    ],
    referenceOptions: references,
    users: recipients.users,
    roles: recipients.roles,
    recipientUsers: own.users,
    recipientRoles: own.roles,
    mailConfigured: isMailConfigured(),
    external,
    settings: external.settingsPath
      ? await loadNotificationSettings(locals, location.organizationId).then((result) =>
          result.ok ? result.data : null,
        )
      : null,
    canCreate: allowed.canCreate,
    canUpdate: allowed.canUpdate,
    canDelete: allowed.canDelete,
  };
}

function emptyDraft(eventType: string | null): AlertDraft {
  return {
    name: '',
    description: '',
    enabled: true,
    eventType: eventType ?? '',
    match: 'all',
    conditions: [],
    channels: ['mail'],
    recipients: emptyRecipients(),
    throttleMinutes: 0,
  };
}

function toDraft(alert: AlertRow): AlertDraft {
  return {
    name: alert.name,
    description: alert.description ?? '',
    enabled: alert.enabled,
    eventType: alert.eventType,
    match: alert.match,
    conditions: alert.conditions.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value: condition.value === undefined ? '' : condition.value,
    })),
    channels: [...alert.channels],
    recipients: { ...emptyRecipients(), ...alert.recipients },
    throttleMinutes: alert.throttleMinutes,
  };
}

export async function loadAlertEditor(
  locals: AlertLocals,
  context: AlertPageContext,
  options: { alertId?: string; eventType?: string | null },
): Promise<AlertEditorData> {
  const { location } = context;
  const allowed = await permissions(locals, location);
  if (!allowed.canRead) throw error(403, 'Forbidden');

  let alert: AlertRow | null = null;
  if (options.alertId) {
    alert = (await alertService.get(options.alertId).catch(() => null))?.toJson() ?? null;
    const sameLocation =
      alert &&
      alert.organizationId === location.organizationId &&
      alert.scope === location.scope &&
      (location.scope === 'organization' || alert.projectId === location.projectId);
    if (!alert || !sameLocation) throw error(404, 'Alert not found');
  } else if (!allowed.canCreate) {
    throw error(403, 'Forbidden');
  }

  const catalog = await listCatalog(locals, location);
  const [references, recipients, external] = await Promise.all([
    referenceOptions(catalog, location),
    recipientOptions(location),
    externalRecipientsData(locals, location, alert?.recipients.emails ?? []),
  ]);

  const draft = alert ? toDraft(alert) : emptyDraft(options.eventType ?? null);
  if (!alert && options.eventType && !catalog.some((entry) => entry.type === options.eventType)) {
    draft.eventType = '';
  }

  return {
    basePath: context.basePath,
    scope: location.scope,
    alertId: alert?.id ?? null,
    draft,
    catalog,
    referenceOptions: references,
    users: recipients.users,
    roles: recipients.roles,
    recipientUsers: recipients.users,
    recipientRoles: recipients.roles,
    mailConfigured: isMailConfigured(),
    external,
    canSave: alert ? allowed.canUpdate : allowed.canCreate,
    canDelete: Boolean(alert) && allowed.canDelete,
  };
}

/** A list field: repeated inputs, or one text input with comma/newline-separated values (no-JS
 * editor). */
function listField(form: FormData, name: string): string[] {
  return form
    .getAll(name)
    .flatMap((value) => String(value).split(/[\n,]/))
    .map((value) => value.trim())
    .filter(Boolean);
}

/** `conditions.<i>.<part>` names → condition list; rows without a field are dropped. */
export function parseAlertForm(form: FormData): AlertDraft {
  const indices = new Set<number>();
  for (const key of form.keys()) {
    const match = key.match(/^conditions\.(\d+)\.field$/);
    if (match) indices.add(Number(match[1]));
  }

  const conditions = [...indices]
    .sort((a, b) => a - b)
    .map((index) => {
      const values = form
        .getAll(`conditions.${index}.value`)
        .map(String)
        .filter((value) => value !== '');
      const multiple = form.get(`conditions.${index}.multiple`) === 'true';
      return {
        field: String(form.get(`conditions.${index}.field`) ?? ''),
        // validated by the service; the draft only echoes it back
        operator: String(
          form.get(`conditions.${index}.operator`) ?? '',
        ) as DraftCondition['operator'],
        value: multiple ? values : (values[0] ?? ''),
      };
    })
    .filter((condition) => condition.field);

  return {
    name: String(form.get('name') ?? ''),
    description: String(form.get('description') ?? ''),
    enabled: form.get('enabled') === 'on' || form.get('enabled') === 'true',
    eventType: String(form.get('eventType') ?? ''),
    match: form.get('match') === 'any' ? 'any' : 'all',
    conditions,
    channels: (() => {
      const channels = form
        .getAll('channels')
        .map(String)
        .filter((channel): channel is AlertChannel =>
          (ALERT_CHANNELS as readonly string[]).includes(channel),
        );
      // the editor always posts at least `mail`; older clients post nothing
      return channels.length > 0 ? [...new Set(channels)] : ['mail'];
    })(),
    recipients: {
      userIds: form.getAll('userIds').map(String),
      roleIds: form.getAll('roleIds').map(String),
      emails: listField(form, 'emails'),
      slackChannels: listField(form, 'slackChannels'),
      googleChatSpaces: listField(form, 'googleChatSpaces'),
      webhookUrls: listField(form, 'webhookUrls'),
    },
    throttleMinutes: Number(form.get('throttleMinutes') ?? 0) || 0,
  };
}

/** The draft as service input: empty optional values become `undefined`. */
function toInput(draft: AlertDraft) {
  return {
    ...draft,
    conditions: draft.conditions.map((condition) => ({
      ...condition,
      value: condition.value === '' ? undefined : condition.value,
    })),
  };
}

/** Form actions shared by the organization and project alert pages. */
export function alertActions(
  resolve: (event: {
    params: Record<string, string>;
    locals: AlertLocals;
  }) => Promise<AlertPageContext>,
) {
  return {
    /**
     * Without JavaScript the editor posts here to add/remove a condition row or to switch the
     * event: nothing is saved, the page comes back with the updated draft.
     */
    async draft(event: { request: Request; params: Record<string, string>; locals: AlertLocals }) {
      const context = await resolve(event);
      const form = await event.request.formData();
      const draft = parseAlertForm(form);
      const intent = String(form.get('intent') ?? '');
      if (intent === 'add_condition' && isEventType(draft.eventType)) {
        const definition = getEventDefinition(draft.eventType) as EventDefinition;
        const [first] = listAlertFields(definition, context.location.scope);
        if (first) {
          draft.conditions.push({
            field: first.key as string,
            operator: first.operators[0],
            value: '',
          });
        }
      } else if (intent.startsWith('remove_condition:')) {
        const index = Number(intent.split(':')[1]);
        draft.conditions.splice(index, 1);
      } else if (intent === 'change_event') {
        draft.conditions = [];
      }
      return { draft };
    },

    async save(event: { request: Request; params: Record<string, string>; locals: AlertLocals }) {
      const context = await resolve(event);
      const form = await event.request.formData();
      const draft = parseAlertForm(form);
      const alertId = String(form.get('alertId') ?? '') || null;
      const result = alertId
        ? await updateAlert(event.locals, alertId, toInput(draft))
        : await createAlert(event.locals, context.location, toInput(draft));
      if (!result.ok) {
        return fail(result.status, { draft, error: result.error, errors: result.errors ?? {} });
      }
      throw redirect(303, `${context.basePath}?saved=${result.data.id}`);
    },

    async test(event: { request: Request; params: Record<string, string>; locals: AlertLocals }) {
      const context = await resolve(event);
      const form = await event.request.formData();
      const draft = parseAlertForm(form);
      const sampleProjectId = String(form.get('sampleProjectId') ?? '') || undefined;
      const result = await testDraftAlert(event.locals, context.location, {
        ...toInput(draft),
        sampleProjectId,
        alertId: String(form.get('alertId') ?? '') || undefined,
        send: form.get('send') === 'true',
      });
      if (!result.ok) {
        return fail(result.status, { draft, error: result.error, errors: result.errors ?? {} });
      }
      return { draft, test: result.data };
    },

    async toggle(event: { request: Request; params: Record<string, string>; locals: AlertLocals }) {
      await resolve(event);
      const form = await event.request.formData();
      const alertId = String(form.get('alertId') ?? '');
      const result = await updateAlert(event.locals, alertId, {
        enabled: form.get('enabled') === 'true',
      });
      if (!result.ok) return fail(result.status, { error: result.error, alertId });
      return { toggled: alertId };
    },

    async delete(event: { request: Request; params: Record<string, string>; locals: AlertLocals }) {
      const context = await resolve(event);
      const form = await event.request.formData();
      const alertId = String(form.get('alertId') ?? '');
      const result = await deleteAlert(event.locals, alertId);
      if (!result.ok) return fail(result.status, { error: result.error, alertId });
      if (form.get('redirect') === 'list') throw redirect(303, context.basePath);
      return { deleted: alertId };
    },
  };
}

/** `/org/<org>/settings/alerts/…` */
export async function organizationAlertContext(event: {
  params: Record<string, string>;
}): Promise<AlertPageContext> {
  const organization = await organizationService.tryFindBySlug(event.params.org);
  if (!organization) throw error(404, 'Organization not found');
  return {
    location: { scope: 'organization', organizationId: organization.id, projectId: null },
    basePath: `/org/${organization.slug}/settings/alerts`,
  };
}

/** `/org/<org>/projects/<slug>/settings/alerts/…` */
export async function projectAlertContext(event: {
  params: Record<string, string>;
}): Promise<AlertPageContext> {
  const project = await projectService.getProjectBySlug(event.params.slug).catch(() => null);
  const organization = project?.organization;
  if (!project || !organization || organization.slug !== event.params.org) {
    throw error(404, 'Project not found');
  }
  return {
    location: { scope: 'project', organizationId: organization.id, projectId: project.id },
    basePath: `/org/${organization.slug}/projects/${project.slug}/settings/alerts`,
  };
}
