import type { EventType } from '#lib/events/domain-events';
import type { Operator } from '#lib/events/catalog';

export type AlertScope = 'organization' | 'project';
export type AlertMatch = 'all' | 'any';

/** v1 only sends emails; the field is ready for in-app and Slack (#82). */
export const ALERT_CHANNELS = ['mail'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export const ALERT_MATCHES = ['all', 'any'] as const;

/** Upper bound of the anti-spam window: one day. */
export const MAX_THROTTLE_MINUTES = 24 * 60;

export type AlertCondition = {
  /** Catalog field key (`summary.critical`, `serviceId`, `projectId`…). */
  field: string;
  operator: Operator;
  /** Absent for `is_true`, `is_false` and `exists`; an array for `in` / `not_in`. */
  value?: string | number | string[];
};

export type AlertRecipients = {
  userIds: string[];
  roleIds: string[];
};

/** Where an alert lives: an organization alert has no project. */
export type AlertLocation = {
  scope: AlertScope;
  organizationId: string;
  projectId: string | null;
};

/** What a client sends to create or replace an alert. Unknown values are validated by the service. */
export type AlertInput = {
  name?: unknown;
  description?: unknown;
  enabled?: unknown;
  eventType?: unknown;
  match?: unknown;
  conditions?: unknown;
  recipients?: unknown;
  channels?: unknown;
  throttleMinutes?: unknown;
};

/** Validated, normalized alert fields. */
export type AlertFields = {
  name: string;
  description: string | null;
  enabled: boolean;
  eventType: EventType;
  match: AlertMatch;
  conditions: AlertCondition[];
  recipients: AlertRecipients;
  channels: AlertChannel[];
  throttleMinutes: number;
};

export type AlertRow = AlertLocation &
  AlertFields & {
    id: string;
    createdByUserId: string;
    createdAt: string;
    updatedAt: string;
  };

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : new Date(0).toISOString();
}

export class AlertDomain implements AlertRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  scope: AlertScope;
  organizationId: string;
  projectId: string | null;
  eventType: EventType;
  match: AlertMatch;
  conditions: AlertCondition[];
  recipients: AlertRecipients;
  channels: AlertChannel[];
  throttleMinutes: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;

  constructor(row: Record<string, any>) {
    this.id = row.id;
    this.name = row.name ?? '';
    this.description = row.description ?? null;
    this.enabled = row.enabled !== false;
    this.scope = row.scope === 'project' ? 'project' : 'organization';
    this.organizationId = row.organizationId;
    this.projectId = this.scope === 'project' ? (row.projectId ?? null) : null;
    this.eventType = row.eventType;
    this.match = row.match === 'any' ? 'any' : 'all';
    this.conditions = Array.isArray(row.conditions) ? row.conditions : [];
    this.recipients = {
      userIds: stringArray(row.recipients?.userIds),
      roleIds: stringArray(row.recipients?.roleIds),
    };
    const channels = stringArray(row.channels).filter((channel): channel is AlertChannel =>
      (ALERT_CHANNELS as readonly string[]).includes(channel),
    );
    this.channels = channels.length > 0 ? channels : ['mail'];
    this.throttleMinutes = Number.isFinite(Number(row.throttleMinutes))
      ? Number(row.throttleMinutes)
      : 0;
    this.createdByUserId = row.createdByUserId;
    this.createdAt = toIso(row.createdAt);
    this.updatedAt = toIso(row.updatedAt);
  }

  get location(): AlertLocation {
    return { scope: this.scope, organizationId: this.organizationId, projectId: this.projectId };
  }

  /**
   * Whether an event that happened in `eventScope` concerns this alert: an organization alert
   * covers the organization and all its projects, a project alert only its project.
   */
  appliesTo(eventScope: { organizationId?: string | null; projectId?: string | null }): boolean {
    if (!eventScope.organizationId || eventScope.organizationId !== this.organizationId) {
      return false;
    }
    return this.scope === 'organization' || eventScope.projectId === this.projectId;
  }

  toJson(): AlertRow {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      enabled: this.enabled,
      scope: this.scope,
      organizationId: this.organizationId,
      projectId: this.projectId,
      eventType: this.eventType,
      match: this.match,
      conditions: this.conditions.map((condition) => ({ ...condition })),
      recipients: {
        userIds: [...this.recipients.userIds],
        roleIds: [...this.recipients.roleIds],
      },
      channels: [...this.channels],
      throttleMinutes: this.throttleMinutes,
      createdByUserId: this.createdByUserId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

/** Field-level validation errors: key → error code (`required`, `invalid_operator`…). */
export type AlertValidationErrors = Record<string, string>;

export class AlertValidationError extends Error {
  constructor(readonly errors: AlertValidationErrors) {
    super(`Invalid alert: ${Object.keys(errors).join(', ')}`);
    this.name = 'AlertValidationError';
  }
}

export class AlertNotFoundError extends Error {
  constructor(id: string) {
    super(`Alert not found: ${id}`);
    this.name = 'AlertNotFoundError';
  }
}
