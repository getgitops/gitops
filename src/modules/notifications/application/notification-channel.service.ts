import {
  CHAT_CHANNEL_TYPES,
  DEFAULT_CHANNEL_LOCALE,
  isChannelLocale,
  isChatChannelType,
  type ChannelLocale,
  type ChatChannelType,
} from '#lib/server/infra/notifications/chat-types';
import type {
  ChannelMessage,
  ChatTransport,
} from '#lib/server/infra/notifications/chat-notification';
import { WebhookDeliveryError } from '#lib/server/infra/http/webhook-request';
import { generateSigningSecret } from '#lib/server/infra/notifications/webhook/webhook-signature';
import type { EventPublisher } from '#lib/server/events';
import {
  MAX_CHANNEL_NAME_LENGTH,
  MAX_CONSECUTIVE_FAILURES,
  SECRET_ROTATION_GRACE_MS,
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
  /** Same for every retry of this delivery (`X-GitOps-Delivery`). */
  deliveryId: string;
  /** Active signing secrets in clear, newest first (signed types only). */
  signingSecrets: string[];
  /** Called by the queue once the delivery succeeded or definitively failed. */
  report: (outcome: { sent: true } | { sent: false; error: unknown }) => void;
};

export type ChannelMessageSource = ChannelMessage | ((locale: ChannelLocale) => ChannelMessage);

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
  locale?: unknown;
  /** Destination URL; on update an empty value keeps the stored one. */
  destination?: unknown;
  enabled?: unknown;
};

/**
 * A channel just created or with a rotated secret. `signingSecret` is in clear and is returned
 * this one time only (signed types; `null` otherwise): it is never readable again.
 */
export type IssuedChannel = {
  channel: NotificationChannelDomain;
  signingSecret: string | null;
};

export type NotificationChannelServiceOptions = {
  now?: () => Date;
  generateId?: () => string;
  generateDeliveryId?: () => string;
  generateSecret?: () => string;
  /** Publishes `notifications.channel.disabled` when a channel disables itself. */
  events?: EventPublisher;
  /** Definitive failures in a row before a channel disables itself (default 20). */
  maxConsecutiveFailures?: number;
  /** How long the previous secret keeps signing after a rotation (default 24 h). */
  rotationGraceMs?: number;
  /** How often a healthy channel records `lastDeliveryAt` (each record is a GitDB commit). */
  deliveryStampIntervalMs?: number;
  /**
   * Whether channels of `type` can be created now, on top of having a transport: Slack needs its
   * app configured (`SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`). Existing channels keep delivering.
   */
  canCreateType?: (type: ChatChannelType) => boolean;
  logger?: {
    warn: (object: object, message: string) => void;
    error?: (object: object, message: string) => void;
  };
};

/** Failures that say nothing about the destination: they never count toward auto-disabling. */
const UNCOUNTED_FAILURES = new Set(['unavailable']);

const DEFAULT_STAMP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Notification channels (chat and webhook destinations) of organizations and projects. The
 * destination is validated by its type's transport (anti-SSRF) before saving and before every
 * send, stored encrypted and only ever shown masked. Signed types also get a signing secret,
 * shown once and rotatable with a grace period. Deliveries go through a queue with retries; a
 * definitive failure is recorded in `lastError`, and after `maxConsecutiveFailures` of them in a
 * row the channel disables itself and `notifications.channel.disabled` is published.
 */
export class NotificationChannelService {
  private readonly now: () => Date;
  private readonly generateId: () => string;
  private readonly stampIntervalMs: number;
  private readonly generateDeliveryId: () => string;
  private readonly generateSecret: () => string;
  private readonly maxFailures: number;
  private readonly rotationGraceMs: number;

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
    this.generateDeliveryId = options.generateDeliveryId ?? (() => crypto.randomUUID());
    this.generateSecret = options.generateSecret ?? generateSigningSecret;
    this.maxFailures = Math.max(1, options.maxConsecutiveFailures ?? MAX_CONSECUTIVE_FAILURES);
    this.rotationGraceMs = options.rotationGraceMs ?? SECRET_ROTATION_GRACE_MS;
  }

  /** Channel types that can be created now: a transport is registered and the type is enabled. */
  availableTypes(): ChatChannelType[] {
    return this.transports.available().filter((type) => this.creatable(type));
  }

  /** Types with a registered transport, enabled or not: the rest are not built yet. */
  registeredTypes(): ChatChannelType[] {
    return this.transports.available();
  }

  private creatable(type: ChatChannelType): boolean {
    return this.options.canCreateType?.(type) ?? true;
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

  /** Channels an alert of `location` may use: its organization's (channels are organization-wide). */
  async listUsable(location: Pick<ChannelLocation, 'organizationId' | 'projectId'>) {
    const channels = await this.repository.listByOrganization(location.organizationId);
    return channels.filter((channel) => channel.usableFrom(location));
  }

  toView(channel: NotificationChannelDomain): NotificationChannelView {
    const {
      webhookUrl: _destination,
      signingSecret: _secret,
      previousSigningSecret: _previous,
      ...rest
    } = channel.toJson();
    void _destination;
    void _secret;
    void _previous;
    let destinationMasked = '••••';
    try {
      destinationMasked = maskDestination(this.cipher.decrypt(channel.id, channel.webhookUrl));
    } catch {
      // an undecryptable destination (rotated key) shows as fully masked
    }
    const transport = this.transports.get(channel.type);
    return {
      ...rest,
      destinationMasked,
      available: transport !== null,
      signed: transport?.signed === true || channel.signingSecret !== null,
      rotationEndsAt: channel.previousSecretActive(this.now())
        ? channel.previousSecretExpiresAt
        : null,
    };
  }

  async create(
    location: ChannelLocation,
    input: ChannelInput,
    actorUserId: string,
  ): Promise<IssuedChannel> {
    const errors: Record<string, string> = {};
    // channels belong to organizations: project alerts use their organization's (#119)
    if (location.scope !== 'organization') errors.scope = 'project_channels_unsupported';
    const type = this.validateType(input.type, errors);
    const name = this.validateName(input.name, errors);
    const locale =
      input.locale === undefined || input.locale === ''
        ? DEFAULT_CHANNEL_LOCALE
        : this.validateLocale(input.locale, errors);
    const destination = type
      ? await this.validateDestination(type, input.destination, errors)
      : null;
    if (Object.keys(errors).length > 0 || !type || !destination) {
      throw new NotificationChannelValidationError(errors);
    }

    const id = this.generateId();
    const timestamp = this.now().toISOString();
    const signingSecret = this.transports.get(type)?.signed ? this.generateSecret() : null;
    const row = new NotificationChannelDomain({
      id,
      type,
      name,
      locale,
      scope: 'organization',
      organizationId: location.organizationId,
      projectId: null,
      webhookUrl: this.cipher.encrypt(id, destination),
      enabled:
        input.enabled === undefined ? true : input.enabled === true || input.enabled === 'true',
      createdByUserId: actorUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastDeliveryAt: null,
      lastError: null,
      signingSecret: signingSecret
        ? this.cipher.encrypt(id, signingSecret, 'signing-secret')
        : null,
      previousSigningSecret: null,
      previousSecretExpiresAt: null,
      consecutiveFailures: 0,
      disabledReason: null,
    }).toJson();
    await this.repository.create(row);
    return { channel: new NotificationChannelDomain(row), signingSecret };
  }

  /**
   * Replaces the signing secret of a signed channel. The previous one keeps signing next to the
   * new one (`v1=` twice) for `rotationGraceMs`, so receivers can switch without losing
   * deliveries. Rotating again during the grace period drops the oldest secret.
   */
  async rotateSecret(id: string): Promise<IssuedChannel> {
    const channel = await this.get(id);
    if (!this.transports.get(channel.type)?.signed) {
      throw new NotificationChannelValidationError({ type: 'not_signed' });
    }
    const signingSecret = this.generateSecret();
    const changes: NotificationChannelChanges = {
      signingSecret: this.cipher.encrypt(channel.id, signingSecret, 'signing-secret'),
      previousSigningSecret: channel.signingSecret,
      previousSecretExpiresAt: channel.signingSecret
        ? new Date(this.now().getTime() + this.rotationGraceMs).toISOString()
        : null,
    };
    await this.repository.update(id, changes);
    return {
      channel: new NotificationChannelDomain({ ...channel.toJson(), ...changes }),
      signingSecret,
    };
  }

  /** Name, enabled and destination; the type can't change. An empty destination keeps it. */
  async update(id: string, input: ChannelInput): Promise<NotificationChannelDomain> {
    const channel = await this.get(id);
    const errors: Record<string, string> = {};
    const changes: NotificationChannelChanges = {};
    if (input.name !== undefined) changes.name = this.validateName(input.name, errors);
    if (input.locale !== undefined && input.locale !== '') {
      changes.locale = this.validateLocale(input.locale, errors);
    }
    if (input.enabled !== undefined) {
      changes.enabled = input.enabled === true || input.enabled === 'true';
      // enabled again by a person (or disabled on purpose): the failure streak is over
      if (changes.enabled !== channel.enabled) {
        changes.disabledReason = null;
        changes.consecutiveFailures = 0;
      }
    }
    if (typeof input.destination === 'string' && input.destination.trim()) {
      const destination = await this.validateDestination(channel.type, input.destination, errors);
      if (destination) {
        changes.webhookUrl = this.cipher.encrypt(channel.id, destination);
        // a new destination starts with a clean slate
        changes.lastError = null;
        changes.consecutiveFailures = 0;
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
   * Deletes every project channel (#119: channels are organization-wide now). Idempotent: with
   * none left it writes nothing. Returns what it deleted so callers can drop the references.
   */
  async purgeProjectChannels(): Promise<Array<{ id: string; organizationId: string }>> {
    const channels = await this.repository.listProjectChannels();
    const deleted: Array<{ id: string; organizationId: string }> = [];
    for (const channel of channels) {
      await this.repository.delete(channel.id);
      deleted.push({ id: channel.id, organizationId: channel.organizationId });
    }
    return deleted;
  }

  /**
   * Queues `message` for the channel and resolves with whether it was delivered. Disabled,
   * deleted, unavailable or invalid channels resolve `false` without sending; nothing throws.
   */
  async deliver(
    channelId: string,
    message: ChannelMessageSource,
    context: Record<string, unknown> = {},
  ): Promise<boolean> {
    const channel = await this.repository.findById(channelId).catch(() => null);
    if (!channel || !channel.enabled) return false;
    return this.send(channel, message, context);
  }

  /** "Send test message": delivers `message` even to a disabled channel, and tells the result. */
  async test(
    id: string,
    message: ChannelMessageSource,
  ): Promise<{ sent: boolean; error: string | null }> {
    const channel = await this.get(id);
    const sent = await this.send(channel, message, { kind: 'channel_test' });
    const after = await this.repository.findById(id).catch(() => null);
    return { sent, error: sent ? null : (after?.lastError ?? 'unavailable') };
  }

  private async send(
    channel: NotificationChannelDomain,
    source: ChannelMessageSource,
    context: Record<string, unknown>,
  ): Promise<boolean> {
    const message = typeof source === 'function' ? source(channel.locale) : source;
    // a test (channel or alert "Send test") never counts toward disabling the channel
    const counts = !message.test;
    const fail = async (reason: string) => {
      await this.recordFailure(channel, reason, counts);
      return false;
    };
    const transport = this.transports.get(channel.type);
    if (!transport) return fail('unavailable');
    let destination: string;
    let signingSecrets: string[] = [];
    try {
      destination = this.cipher.decrypt(channel.id, channel.webhookUrl);
      if (transport.signed) signingSecrets = this.activeSecrets(channel);
    } catch {
      return fail('undecryptable');
    }
    if (transport.signed && signingSecrets.length === 0) return fail('missing_secret');
    // the stored value is checked again: GitDB can be edited outside the app, and DNS changes
    const checked = await Promise.resolve(transport.validateDestination(destination)).catch(() => ({
      ok: false as const,
    }));
    if (!checked.ok) return fail('invalid_destination');

    let outcome: { sent: true } | { sent: false; error: unknown } = { sent: false, error: null };
    const sent = await this.sender.enqueue(
      {
        channelId: channel.id,
        type: channel.type,
        destination,
        message,
        deliveryId: this.generateDeliveryId(),
        signingSecrets,
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
        counts,
      );
    }
    return sent;
  }

  /** Signing secrets in clear, newest first; the previous one only during its grace period. */
  private activeSecrets(channel: NotificationChannelDomain): string[] {
    if (!channel.signingSecret) return [];
    const secrets = [this.cipher.decrypt(channel.id, channel.signingSecret, 'signing-secret')];
    if (channel.previousSecretActive(this.now())) {
      try {
        secrets.push(
          this.cipher.decrypt(channel.id, channel.previousSigningSecret!, 'signing-secret'),
        );
      } catch {
        // the old secret is only a courtesy to receivers: the new one still signs
      }
    }
    return secrets;
  }

  private async recordSuccess(channel: NotificationChannelDomain) {
    const last = channel.lastDeliveryAt ? Date.parse(channel.lastDeliveryAt) : 0;
    const stale = this.now().getTime() - last >= this.stampIntervalMs;
    // each write is a commit: only when the error clears, a streak ends or the stamp got old
    if (!channel.lastError && channel.consecutiveFailures === 0 && !stale) return;
    await this.repository
      .update(channel.id, {
        lastDeliveryAt: this.now().toISOString(),
        lastError: null,
        consecutiveFailures: 0,
      })
      .catch((error) => this.logWriteFailure(channel, error));
  }

  /**
   * Records a failed delivery. Real deliveries (`counts`) extend the failure streak, and the one
   * that reaches the limit disables an enabled channel and announces it. Test messages (from the
   * channel or from an alert's "Send test") only record the reason: a person is watching them.
   */
  private async recordFailure(channel: NotificationChannelDomain, reason: string, counts = true) {
    if (!counts || UNCOUNTED_FAILURES.has(reason)) {
      if (channel.lastError === reason) return;
      await this.repository
        .update(channel.id, { lastError: reason })
        .catch((error) => this.logWriteFailure(channel, error));
      return;
    }

    const failures = channel.consecutiveFailures + 1;
    const disable = channel.enabled && failures >= this.maxFailures;
    const changes: NotificationChannelChanges = {
      lastError: reason,
      consecutiveFailures: failures,
    };
    if (disable) {
      changes.enabled = false;
      changes.disabledReason = 'failures';
    }
    try {
      await this.repository.update(channel.id, changes);
    } catch (error) {
      this.logWriteFailure(channel, error);
      return;
    }
    // the row read before sending is stale now: keep the in-memory copy in step for callers
    Object.assign(channel, changes);
    if (disable) this.announceDisabled(channel, failures, reason);
  }

  private announceDisabled(channel: NotificationChannelDomain, failures: number, reason: string) {
    this.options.logger?.warn(
      { channelId: channel.id, type: channel.type, failures, reason },
      '[channels] channel disabled after repeated delivery failures',
    );
    try {
      this.options.events?.publish(
        'notifications.channel.disabled',
        {
          channelId: channel.id,
          name: channel.name,
          type: channel.type,
          reason: 'failures',
          failures,
          lastError: reason,
          createdByUserId: channel.createdByUserId,
        },
        {
          scope: { organizationId: channel.organizationId, projectId: channel.projectId },
          // the platform did it, not whoever caused the event that failed to deliver
          actor: { kind: 'system' },
        },
      );
    } catch (error) {
      this.options.logger?.error?.(
        { channelId: channel.id, err: error instanceof Error ? error.name : 'unknown' },
        '[channels] failed to publish notifications.channel.disabled',
      );
    }
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
    if (!this.creatable(value)) {
      errors.type = 'type_disabled';
      return null;
    }
    return value;
  }

  private validateLocale(value: unknown, errors: Record<string, string>): ChannelLocale {
    if (isChannelLocale(value)) return value;
    errors.locale = 'invalid_locale';
    return DEFAULT_CHANNEL_LOCALE;
  }

  private validateName(value: unknown, errors: Record<string, string>): string {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name) errors.name = 'required';
    else if (name.length > MAX_CHANNEL_NAME_LENGTH) errors.name = 'too_long';
    return name;
  }

  private async validateDestination(
    type: ChatChannelType,
    value: unknown,
    errors: Record<string, string>,
  ): Promise<string | null> {
    if (typeof value !== 'string' || !value.trim()) {
      errors.destination = 'required';
      return null;
    }
    const transport = this.transports.get(type);
    if (!transport) {
      errors.type = 'type_unavailable';
      return null;
    }
    const checked = await transport.validateDestination(value.trim());
    if (!checked.ok) {
      errors.destination = checked.error;
      return null;
    }
    return checked.url.toString();
  }
}

export { CHAT_CHANNEL_TYPES };
