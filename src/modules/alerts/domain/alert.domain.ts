import type { EventType } from '#lib/events/domain-events';
import type { Operator } from '#lib/events/catalog';

export type AlertScope = 'organization' | 'project';
export type AlertMatch = 'all' | 'any';

/**
 * Where an alert is delivered. An alert can use several channels at once and sends one message to
 * each. Only `mail` is delivered today; the others are stored and validated so the UI and the API
 * are ready when their notifiers land (#82).
 */
export const ALERT_CHANNELS = ['mail', 'slack', 'google_chat', 'webhook'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];
/** Channels with a notifier: the rest are skipped by the engine. */
export const DELIVERED_CHANNELS: readonly AlertChannel[] = ['mail'];

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

/** Targets per channel; only the arrays of the alert's enabled channels are kept. */
export type AlertRecipients = {
  /** mail: platform users */
  userIds: string[];
  /** mail: every member holding one of these roles */
  roleIds: string[];
  emails: string[];
  /** slack: channel names, stored with their `#` */
  slackChannels: string[];
  /** google_chat: space names */
  googleChatSpaces: string[];
  /** webhook: http(s) URLs that receive a JSON POST */
  webhookUrls: string[];
};

export function emptyRecipients(): AlertRecipients {
  return {
    userIds: [],
    roleIds: [],
    emails: [],
    slackChannels: [],
    googleChatSpaces: [],
    webhookUrls: [],
  };
}

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
      emails: [
        ...new Set([
          ...stringArray(row.recipients?.emails),
          ...stringArray(
            (row.recipients as { externalEmails?: unknown } | undefined)?.externalEmails,
          ),
        ]),
      ],
      slackChannels: stringArray(row.recipients?.slackChannels),
      googleChatSpaces: stringArray(row.recipients?.googleChatSpaces),
      webhookUrls: stringArray(row.recipients?.webhookUrls),
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
        emails: [...this.recipients.emails],
        slackChannels: [...this.recipients.slackChannels],
        googleChatSpaces: [...this.recipients.googleChatSpaces],
        webhookUrls: [...this.recipients.webhookUrls],
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
