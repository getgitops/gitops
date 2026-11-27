import {
  getEventDefinition,
  getFieldValue,
  isEventType,
  type EventDefinition,
  type EventModule,
} from '#lib/events/catalog';
import type { LoggedEvent } from '#lib/server/events';

export const EVENT_MODULES: readonly EventModule[] = [
  'code_report',
  'vault',
  'projects',
  'organization',
  'access',
  'notifications',
  'state_iac',
];

export type EventStatusFilter = 'all' | 'pending' | 'acked';

export type EventFieldView = {
  /** i18n key */
  label: string;
  value: string;
  /** `value` is an i18n key (booleans) rather than display text. */
  translate?: boolean;
};

export type EventView = {
  id: string;
  type: string;
  module: EventModule;
  /** i18n key */
  label: string;
  occurredAt: string;
  actor: { kind: 'user' | 'api_key' | 'system'; name: string | null };
  project: { id: string; name: string | null } | null;
  fields: EventFieldView[];
  ack: { username: string; at: string } | null;
};

type PermissionContext =
  | { scope: 'organization'; organizationId: string }
  | { scope: 'project'; organizationId: string; projectId: string };

export type PermissionCheck = (permission: string, context: PermissionContext) => Promise<boolean>;

/**
 * Whether the viewer may see (and acknowledge) an event: the event's `readPermission` checked in
 * the scope it belongs to. Results are cached per permission and project for one request.
 */
export function createEventVisibility(organizationId: string, can: PermissionCheck) {
  const cache = new Map<string, Promise<boolean>>();

  return (entry: LoggedEvent): Promise<boolean> => {
    if (!isEventType(entry.event.type)) return Promise.resolve(false);
    if (entry.event.scope.organizationId !== organizationId) return Promise.resolve(false);

    const { readPermission } = getEventDefinition(entry.event.type);
    const projectId = entry.event.scope.projectId ?? null;
    // project grants are checked against the project; organization grants against the org
    const context: PermissionContext =
      readPermission.startsWith('project:') && projectId
        ? { scope: 'project', organizationId, projectId }
        : { scope: 'organization', organizationId };

    const key = `${readPermission}|${context.scope === 'project' ? context.projectId : ''}`;
    let allowed = cache.get(key);
    if (!allowed) {
      allowed = can(readPermission, context).catch(() => false);
      cache.set(key, allowed);
    }
    return allowed;
  };
}

export type EventViewLookups = {
  usernames: Map<string, string>;
  projectNames: Map<string, string>;
  apiKeyNames?: Map<string, string>;
  serviceNames?: Map<string, string>;
  roleNames?: Map<string, string>;
};

const REFERENCE_LOOKUP: Partial<
  Record<NonNullable<EventDefinition['fields'][number]['reference']>, keyof EventViewLookups>
> = {
  user: 'usernames',
  project: 'projectNames',
  api_key: 'apiKeyNames',
  code_report_service: 'serviceNames',
  role: 'roleNames',
};

function formatValue(
  value: unknown,
  reference: EventDefinition['fields'][number]['reference'],
  lookups: EventViewLookups,
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    return value.length === 0
      ? '—'
      : value.map((item) => formatValue(item, reference, lookups)).join(', ');
  }
  if (typeof value === 'string') {
    const lookup = reference ? REFERENCE_LOOKUP[reference] : undefined;
    return (lookup && lookups[lookup]?.get(value)) || value;
  }
  return String(value);
}

export function toEventView(entry: LoggedEvent, lookups: EventViewLookups): EventView | null {
  const { event } = entry;
  if (!isEventType(event.type)) return null;
  const definition = getEventDefinition(event.type) as EventDefinition;

  const actor: EventView['actor'] =
    event.actor.kind === 'user'
      ? { kind: 'user', name: lookups.usernames.get(event.actor.userId) ?? event.actor.userId }
      : event.actor.kind === 'api_key'
        ? {
            kind: 'api_key',
            name: lookups.apiKeyNames?.get(event.actor.apiKeyId) ?? null,
          }
        : { kind: 'system', name: null };

  const projectId = event.scope.projectId ?? null;

  return {
    id: event.id,
    type: event.type,
    module: definition.module,
    label: definition.label,
    occurredAt: event.occurredAt,
    actor,
    project: projectId
      ? { id: projectId, name: lookups.projectNames.get(projectId) ?? null }
      : null,
    fields: definition.fields.map((field) => {
      const value = getFieldValue(event, field.key as string);
      return typeof value === 'boolean'
        ? { label: field.label, value: value ? 'common.yes' : 'common.no', translate: true }
        : { label: field.label, value: formatValue(value, field.reference, lookups) };
    }),
    ack: entry.ack ? { username: entry.ack.username, at: entry.ack.at } : null,
  };
}

export function parseStatusFilter(value: string | null): EventStatusFilter {
  return value === 'pending' || value === 'acked' ? value : 'all';
}

export function parseModuleFilter(value: string | null): EventModule | null {
  return EVENT_MODULES.find((module) => module === value) ?? null;
}
