import {
  CHAT_CHANNEL_TYPES,
  isChatChannelType,
  type ChatChannelType,
} from '#lib/server/infra/notifications/chat-types';
import type {
  ChannelMessage,
  ChatTransport,
} from '#lib/server/infra/notifications/chat-notification';
import { WebhookDeliveryError } from '#lib/server/infra/http/webhook-request';
import {
  MAX_CHANNEL_NAME_LENGTH,
  NotificationChannelDomain,
  NotificationChannelNotFoundError,
  NotificationChannelValidationError,
  maskDestination,
  type ChannelLocation,
  type NotificationChannelView,
} from '../domain/notification-channel.domain';
import type { ChannelCipher } from '../infrastructure/crypto/channel-cipher';
import type {
  NotificationChannelChanges,
  NotificationChannelRepositoryPort,
} from '../infrastructure/repositories/notification-channel.repository';

/** One message on its way to one channel; the destination is only held in memory. */
export type ChannelDelivery = {
  channelId: string;
  type: ChatChannelType;
  destination: string;
  message: ChannelMessage;
  /** Called by the queue once the delivery succeeded or definitively failed. */
  report: (outcome: { sent: true } | { sent: false; error: unknown }) => void;
};

/** Where deliveries go: the channel queue in production, a direct sender in tests. */
export type ChannelSender = {
  enqueue(delivery: ChannelDelivery, context?: Record<string, unknown>): Promise<boolean>;
};

export type ChannelTransports = {
  get(type: ChatChannelType): ChatTransport | null;
  available(): ChatChannelType[];
};

export type ChannelInput = {
  type?: unknown;
  name?: unknown;
  /** Destination URL; on update an empty value keeps the stored one. */
  destination?: unknown;
  enabled?: unknown;
};

export type NotificationChannelServiceOptions = {
  now?: () => Date;
  generateId?: () => string;
  /** How often a healthy channel records `lastDeliveryAt` (each record is a GitDB commit). */
  deliveryStampIntervalMs?: number;
  logger?: { warn: (object: object, message: string) => void };
};

const DEFAULT_STAMP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Notification channels (chat and webhook destinations) of organizations and projects. The
 * destination is validated by its type's transport (anti-SSRF) before saving and before every
 * send, stored encrypted and only ever shown masked. Deliveries go through a queue with retries;
 * a permanent failure is recorded in `lastError`.
 */
export class NotificationChannelService {
  private readonly now: () => Date;
  private readonly generateId: () => string;
  private readonly stampIntervalMs: number;

  constructor(
    private readonly repository: NotificationChannelRepositoryPort,
    private readonly cipher: ChannelCipher,
    private readonly transports: ChannelTransports,
    private readonly sender: ChannelSender,
    private readonly options: NotificationChannelServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
    this.stampIntervalMs = options.deliveryStampIntervalMs ?? DEFAULT_STAMP_INTERVAL_MS;
  }

  /** Channel types that can be created now (a transport is registered for them). */
  availableTypes(): ChatChannelType[] {
    return this.transports.available();
  }

  async get(id: string): Promise<NotificationChannelDomain> {
    const channel = await this.repository.findById(id);
    if (!channel) throw new NotificationChannelNotFoundError(id);
    return channel;
  }

  /** The location's own channels: organization-level ones, or one project's. */
  async list(location: Pick<ChannelLocation, 'organizationId' | 'projectId'>) {
    const channels = await this.repository.listByOrganization(location.organizationId);
    return channels.filter((channel) =>
      location.projectId
        ? channel.projectId === location.projectId
        : channel.scope === 'organization',
    );
  }

  /** Channels an alert of `location` may use: its project's and its organization's. */
  async listUsable(location: Pick<ChannelLocation, 'organizationId' | 'projectId'>) {
    const channels = await this.repository.listByOrganization(location.organizationId);
    return channels.filter((channel) => channel.usableFrom(location));
  }

  toView(channel: NotificationChannelDomain): NotificationChannelView {
    const { webhookUrl: _secret, ...rest } = channel.toJson();
    void _secret;
    let destinationMasked = '••••';
    try {
      destinationMasked = maskDestination(this.cipher.decrypt(channel.id, channel.webhookUrl));
    } catch {
      // an undecryptable destination (rotated key) shows as fully masked
    }
    return {
      ...rest,
      destinationMasked,
      available: this.transports.get(channel.type) !== null,
    };
  }

  async create(
    location: ChannelLocation,
    input: ChannelInput,
    actorUserId: string,
  ): Promise<NotificationChannelDomain> {
    const errors: Record<string, string> = {};
    const type = this.validateType(input.type, errors);
    const name = this.validateName(input.name, errors);
    const destination = type ? this.validateDestination(type, input.destination, errors) : null;
    if (Object.keys(errors).length > 0 || !type || !destination) {
      throw new NotificationChannelValidationError(errors);
    }

    const id = this.generateId();
    const timestamp = this.now().toISOString();
    const row = new NotificationChannelDomain({
      id,
      type,
      name,
      ...location,
      projectId: location.scope === 'project' ? location.projectId : null,
      webhookUrl: this.cipher.encrypt(id, destination),
      enabled:
        input.enabled === undefined ? true : input.enabled === true || input.enabled === 'true',
      createdByUserId: actorUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastDeliveryAt: null,
      lastError: null,
    }).toJson();
    await this.repository.create(row);
    return new NotificationChannelDomain(row);
  }

  /** Name, enabled and destination; the type can't change. An empty destination keeps it. */
  async update(id: string, input: ChannelInput): Promise<NotificationChannelDomain> {
    const channel = await this.get(id);
    const errors: Record<string, string> = {};
    const changes: NotificationChannelChanges = {};
    if (input.name !== undefined) changes.name = this.validateName(input.name, errors);
    if (input.enabled !== undefined) {
      changes.enabled = input.enabled === true || input.enabled === 'true';
    }
    if (typeof input.destination === 'string' && input.destination.trim()) {
      const destination = this.validateDestination(channel.type, input.destination, errors);
      if (destination) {
        changes.webhookUrl = this.cipher.encrypt(channel.id, destination);
        // a new destination starts with a clean slate
        changes.lastError = null;
      }
    }
    if (Object.keys(errors).length > 0) throw new NotificationChannelValidationError(errors);
    await this.repository.update(id, changes);
    return new NotificationChannelDomain({ ...channel.toJson(), ...changes });
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.repository.delete(id);
  }

  /**
   * Queues `message` for the channel and resolves with whether it was delivered. Disabled,
   * deleted, unavailable or invalid channels resolve `false` without sending; nothing throws.
   */
  async deliver(
    channelId: string,
    message: ChannelMessage,
    context: Record<string, unknown> = {},
  ): Promise<boolean> {
    const channel = await this.repository.findById(channelId).catch(() => null);
    if (!channel || !channel.enabled) return false;
    return this.send(channel, message, context);
  }

  /** "Send test message": delivers `message` even to a disabled channel, and tells the result. */
  async test(
    id: string,
    message: ChannelMessage,
  ): Promise<{ sent: boolean; error: string | null }> {
    const channel = await this.get(id);
    const sent = await this.send(channel, message, { kind: 'channel_test' });
    const after = await this.repository.findById(id).catch(() => null);
    return { sent, error: sent ? null : (after?.lastError ?? 'unavailable') };
  }

  private async send(
    channel: NotificationChannelDomain,
    message: ChannelMessage,
    context: Record<string, unknown>,
  ): Promise<boolean> {
    const transport = this.transports.get(channel.type);
    if (!transport) {
      await this.recordFailure(channel, 'unavailable');
      return false;
    }
    let destination: string;
    try {
      destination = this.cipher.decrypt(channel.id, channel.webhookUrl);
    } catch {
      await this.recordFailure(channel, 'undecryptable');
      return false;
    }
    // the stored value is checked again: GitDB can be edited outside the app
    if (!transport.validateDestination(destination).ok) {
      await this.recordFailure(channel, 'invalid_destination');
      return false;
    }

    let outcome: { sent: true } | { sent: false; error: unknown } = { sent: false, error: null };
    const sent = await this.sender.enqueue(
      {
        channelId: channel.id,
        type: channel.type,
        destination,
        message,
        report: (result) => {
          outcome = result;
        },
      },
      { channelId: channel.id, type: channel.type, ...context },
    );
    if (sent) await this.recordSuccess(channel);
    else {
      const error = (outcome as { error?: unknown }).error;
      await this.recordFailure(
        channel,
        error instanceof WebhookDeliveryError
          ? error.summary
          : error instanceof Error
            ? error.name
            : 'failed',
      );
    }
    return sent;
  }

  private async recordSuccess(channel: NotificationChannelDomain) {
    const last = channel.lastDeliveryAt ? Date.parse(channel.lastDeliveryAt) : 0;
    const stale = this.now().getTime() - last >= this.stampIntervalMs;
    // each write is a commit: only when the error clears or the stamp got old
    if (!channel.lastError && !stale) return;
    await this.repository
      .update(channel.id, { lastDeliveryAt: this.now().toISOString(), lastError: null })
      .catch((error) => this.logWriteFailure(channel, error));
  }

  private async recordFailure(channel: NotificationChannelDomain, reason: string) {
    if (channel.lastError === reason) return;
    await this.repository
      .update(channel.id, { lastError: reason })
      .catch((error) => this.logWriteFailure(channel, error));
  }

  private logWriteFailure(channel: NotificationChannelDomain, error: unknown) {
    this.options.logger?.warn(
      { channelId: channel.id, err: error instanceof Error ? error.name : 'unknown' },
      '[channels] delivery outcome could not be recorded',
    );
  }

  private validateType(value: unknown, errors: Record<string, string>): ChatChannelType | null {
    if (!isChatChannelType(value)) {
      errors.type = typeof value === 'string' && value ? 'invalid_type' : 'required';
      return null;
    }
    if (!this.transports.get(value)) {
      errors.type = 'type_unavailable';
      return null;
    }
    return value;
  }

  private validateName(value: unknown, errors: Record<string, string>): string {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name) errors.name = 'required';
    else if (name.length > MAX_CHANNEL_NAME_LENGTH) errors.name = 'too_long';
    return name;
  }

  private validateDestination(
    type: ChatChannelType,
    value: unknown,
    errors: Record<string, string>,
  ): string | null {
    if (typeof value !== 'string' || !value.trim()) {
      errors.destination = 'required';
      return null;
    }
    const transport = this.transports.get(type);
    if (!transport) {
      errors.type = 'type_unavailable';
      return null;
    }
    const checked = transport.validateDestination(value.trim());
    if (!checked.ok) {
      errors.destination = checked.error;
      return null;
    }
    return checked.url.toString();
  }
}

export { CHAT_CHANNEL_TYPES };
