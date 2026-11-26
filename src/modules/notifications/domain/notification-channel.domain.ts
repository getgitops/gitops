import {
  DEFAULT_CHANNEL_LOCALE,
  isChannelLocale,
  isChatChannelType,
  type ChannelLocale,
  type ChatChannelType,
} from '#lib/server/infra/notifications/chat-types';

export type ChannelScope = 'organization' | 'project';

/** Where a channel lives: an organization channel has no project. */
export type ChannelLocation = {
  scope: ChannelScope;
  organizationId: string;
  projectId: string | null;
};

export type NotificationChannelRow = ChannelLocation & {
  id: string;
  type: ChatChannelType;
  name: string;
  locale: ChannelLocale;
  /** Destination URL, encrypted (`channel-cipher.ts`): never returned nor logged. */
  webhookUrl: string;
  enabled: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt: string | null;
  /** Short reason of the last failed delivery (`HTTP 404`, `timeout`), cleared on success. */
  lastError: string | null;
  /** Signing secret (signed types only), encrypted: never returned nor logged. */
  signingSecret: string | null;
  /** Secret being replaced, encrypted; still signs until `previousSecretExpiresAt`. */
  previousSigningSecret: string | null;
  previousSecretExpiresAt: string | null;
  /** Definitive delivery failures in a row (tests don't count); reset by a success. */
  consecutiveFailures: number;
  /** `failures` when the platform disabled the channel; `null` otherwise. */
  disabledReason: ChannelDisabledReason | null;
};

export type ChannelDisabledReason = 'failures';

/** Encrypted fields: none of them ever leaves the server. */
type SecretFields = 'webhookUrl' | 'signingSecret' | 'previousSigningSecret';

/** What the API and the pages may show: the destination only masked, secrets never. */
export type NotificationChannelView = Omit<NotificationChannelRow, SecretFields> & {
  /** `https://hooks.slack.com/…/••••1a2b` */
  destinationMasked: string;
  /** Whether its type has a transport: channels of other types are kept but send nothing. */
  available: boolean;
  /** Its type signs deliveries (`webhook`): it has a secret that can be rotated. */
  signed: boolean;
  /** A rotation is in its grace period: the previous secret still signs until this date. */
  rotationEndsAt: string | null;
};

/** Definitive failures in a row after which a channel disables itself. */
export const MAX_CONSECUTIVE_FAILURES = 20;
/** How long the previous secret keeps signing after a rotation. */
export const SECRET_ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

export const MAX_CHANNEL_NAME_LENGTH = 80;

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? value : null;
}

export class NotificationChannelDomain implements NotificationChannelRow {
  id: string;
  type: ChatChannelType;
  name: string;
  locale: ChannelLocale;
  scope: ChannelScope;
  organizationId: string;
  projectId: string | null;
  webhookUrl: string;
  enabled: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt: string | null;
  lastError: string | null;
  signingSecret: string | null;
  previousSigningSecret: string | null;
  previousSecretExpiresAt: string | null;
  consecutiveFailures: number;
  disabledReason: ChannelDisabledReason | null;

  constructor(row: Record<string, any>) {
    this.id = row.id;
    this.type = isChatChannelType(row.type) ? row.type : 'webhook';
    this.name = row.name ?? '';
    this.locale = isChannelLocale(row.locale) ? row.locale : DEFAULT_CHANNEL_LOCALE;
    this.scope = row.scope === 'project' ? 'project' : 'organization';
    this.organizationId = row.organizationId;
    this.projectId = this.scope === 'project' ? (row.projectId ?? null) : null;
    this.webhookUrl = row.webhookUrl ?? '';
    this.enabled = row.enabled !== false;
    this.createdByUserId = row.createdByUserId;
    this.createdAt = toIso(row.createdAt) ?? new Date(0).toISOString();
    this.updatedAt = toIso(row.updatedAt) ?? this.createdAt;
    this.lastDeliveryAt = toIso(row.lastDeliveryAt);
    this.lastError = row.lastError ?? null;
    this.signingSecret = row.signingSecret || null;
    this.previousSigningSecret = row.previousSigningSecret || null;
    this.previousSecretExpiresAt = toIso(row.previousSecretExpiresAt);
    const failures = Number(row.consecutiveFailures);
    this.consecutiveFailures = Number.isInteger(failures) && failures > 0 ? failures : 0;
    this.disabledReason = row.disabledReason === 'failures' ? 'failures' : null;
  }

  /** Whether the previous secret still signs at `now` (rotation grace period). */
  previousSecretActive(now: Date): boolean {
    if (!this.previousSigningSecret || !this.previousSecretExpiresAt) return false;
    return Date.parse(this.previousSecretExpiresAt) > now.getTime();
  }

  get location(): ChannelLocation {
    return { scope: this.scope, organizationId: this.organizationId, projectId: this.projectId };
  }

  /**
   * Whether an alert of `location` may use it: an organization channel serves the organization
   * and all its projects, a project channel only alerts of its project.
   */
  usableFrom(location: Pick<ChannelLocation, 'organizationId' | 'projectId'>): boolean {
    if (location.organizationId !== this.organizationId) return false;
    return this.scope === 'organization' || location.projectId === this.projectId;
  }

  toJson(): NotificationChannelRow {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      locale: this.locale,
      scope: this.scope,
      organizationId: this.organizationId,
      projectId: this.projectId,
      webhookUrl: this.webhookUrl,
      enabled: this.enabled,
      createdByUserId: this.createdByUserId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastDeliveryAt: this.lastDeliveryAt,
      lastError: this.lastError,
      signingSecret: this.signingSecret,
      previousSigningSecret: this.previousSigningSecret,
      previousSecretExpiresAt: this.previousSecretExpiresAt,
      consecutiveFailures: this.consecutiveFailures,
      disabledReason: this.disabledReason,
    };
  }
}

/** `https://hooks.slack.com/services/T0/B0/xyz1a2b` → `https://hooks.slack.com/…/••••1a2b`. */
export function maskDestination(url: string): string {
  try {
    const parsed = new URL(url);
    const tail = url.replace(/[?#].*$/, '').slice(-4);
    return `${parsed.protocol}//${parsed.host}/…/••••${tail}`;
  } catch {
    return '••••';
  }
}

export class NotificationChannelValidationError extends Error {
  constructor(readonly errors: Record<string, string>) {
    super(`Invalid notification channel: ${Object.keys(errors).join(', ')}`);
    this.name = 'NotificationChannelValidationError';
  }
}

export class NotificationChannelNotFoundError extends Error {
  constructor(id: string) {
    super(`Notification channel not found: ${id}`);
    this.name = 'NotificationChannelNotFoundError';
  }
}
