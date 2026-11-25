import {
  isChatChannelType,
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
  /** Destination URL, encrypted (`channel-cipher.ts`): never returned nor logged. */
  webhookUrl: string;
  enabled: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt: string | null;
  /** Short reason of the last failed delivery (`HTTP 404`, `timeout`), cleared on success. */
  lastError: string | null;
};

/** What the API and the pages may show: the destination only masked. */
export type NotificationChannelView = Omit<NotificationChannelRow, 'webhookUrl'> & {
  /** `https://hooks.slack.com/…/••••1a2b` */
  destinationMasked: string;
  /** Whether its type has a transport: channels of other types are kept but send nothing. */
  available: boolean;
};

export const MAX_CHANNEL_NAME_LENGTH = 80;

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? value : null;
}

export class NotificationChannelDomain implements NotificationChannelRow {
  id: string;
  type: ChatChannelType;
  name: string;
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

  constructor(row: Record<string, any>) {
    this.id = row.id;
    this.type = isChatChannelType(row.type) ? row.type : 'webhook';
    this.name = row.name ?? '';
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
