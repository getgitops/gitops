import {
  ChatNotification,
  ChatTransportUnavailableError,
  DeliveryQueue,
  absoluteUrl,
  availableChatTypes,
  getChatTransport,
  notify,
  registerChatTransport,
} from '#lib/server/infra/notifications';
import { createWebhookTransport } from '#lib/server/infra/notifications/webhook/webhook.transport';
import { createSlackTransport } from '#lib/server/infra/notifications/slack/slack.transport';
import { eventBus } from '#lib/server/events';
import { isRetryableWebhookError, webhookRetryAfter } from '#lib/server/infra/http/webhook-request';
import { RateLimiter } from '#lib/server/infra/rate-limit';
import { createLogger } from '#lib/server/logger';
import { passwordService } from '../auth';
import { organizationService } from '../organization';
import { ExternalRecipientService } from './application/external-recipient.service';
import { NotificationSettingsService } from './application/notification-settings.service';
import {
  NotificationChannelService,
  type ChannelDelivery,
} from './application/notification-channel.service';
import { createChannelCipher } from './infrastructure/crypto/channel-cipher';
import { readWebhookChannelConfig } from './infrastructure/config/webhook.config';
import { readSlackAppConfig } from './infrastructure/config/slack-app.config';
import { SlackOAuthClient } from './infrastructure/slack/slack-oauth.client';
import { SlackConnectService } from './application/slack-connect.service';
import { NotificationChannelRepository } from './infrastructure/repositories/notification-channel.repository';
import { ExternalRecipientMailNotifier } from './infrastructure/external-recipient-mail.notifier';
import { ExternalRecipientRepository } from './infrastructure/repositories/external-recipient.repository';
import { NotificationSettingsRepository } from './infrastructure/repositories/notification-settings.repository';

const log = createLogger('notifications');

const settingsRepository = new NotificationSettingsRepository();

const LIMITERS_KEY = Symbol.for('gitops.notifications.verification-limiters');
type Limiters = { perAddress: RateLimiter; perOrganization: RateLimiter };
type GlobalWithLimiters = typeof globalThis & { [LIMITERS_KEY]?: Limiters };

// only the rate limits live on `globalThis`, so they survive HMR. The service must not: kept
// across a module reload, its repositories would read a stale GitDB client and cache
const limiters = ((globalThis as GlobalWithLimiters)[LIMITERS_KEY] ??= {
  perAddress: new RateLimiter({ limit: 3, windowMs: 60 * 60 * 1000 }),
  perOrganization: new RateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 }),
});

export const externalRecipientService = new ExternalRecipientService(
  new ExternalRecipientRepository(),
  settingsRepository,
  new ExternalRecipientMailNotifier({
    send: (notification) => notify(notification),
    organizationName: async (id) =>
      (await organizationService.getOrganization(id).catch(() => null))?.name ?? null,
  }),
  {
    secret: () => passwordService.ensureEncryptionKey(),
    absoluteUrl: (path) => absoluteUrl(path),
    perAddressLimiter: limiters.perAddress,
    perOrganizationLimiter: limiters.perOrganization,
    logger: log,
  },
);

export const notificationSettingsService = new NotificationSettingsService(
  settingsRepository,
  externalRecipientService,
);

// transports of the channel types this build supports; Slack (#97) and Google Chat (#98) add
// theirs here. Registering again on HMR just replaces the previous one
registerChatTransport('webhook', createWebhookTransport(readWebhookChannelConfig()));
registerChatTransport('slack', createSlackTransport());

const CHANNEL_QUEUE_KEY = Symbol.for('gitops.notifications.channel-queue');
const CHANNEL_SHUTDOWN_KEY = Symbol.for('gitops.notifications.channel-shutdown');
type GlobalWithChannelQueue = typeof globalThis & {
  [CHANNEL_QUEUE_KEY]?: DeliveryQueue<ChannelDelivery>;
  [CHANNEL_SHUTDOWN_KEY]?: boolean;
};

export const channelQueue: DeliveryQueue<ChannelDelivery> = ((globalThis as GlobalWithChannelQueue)[
  CHANNEL_QUEUE_KEY
] ??= new DeliveryQueue<ChannelDelivery>({
  // the transport comes from the process-wide registry, not from `notify()`: in dev the server code
  // runs in more than one Vite module runner (and HMR reloads it), and each copy of `notify` has
  // its own transport map, where the chat transports may be missing
  send: async (delivery) => {
    const transport = getChatTransport(delivery.type);
    if (!transport) throw new ChatTransportUnavailableError(delivery.type);
    const notification = new ChatNotification({
      channel: delivery.type,
      destination: delivery.destination,
      message: delivery.message,
      deliveryId: delivery.deliveryId,
      signingSecrets: delivery.signingSecrets,
    });
    notification.validate();
    await transport.send(notification);
  },
  concurrency: 3,
  retry: { isRetryable: isRetryableWebhookError, retryAfterMs: webhookRetryAfter },
  logger: createLogger('channels'),
  label: { prefix: '[channels]', noun: 'message', plural: 'messages' },
  describe: (delivery) => ({ channelId: delivery.channelId, type: delivery.type }),
  onSettled: (delivery, outcome) => delivery.report(outcome),
}));

export const notificationChannelService = new NotificationChannelService(
  new NotificationChannelRepository(),
  createChannelCipher(() => passwordService.ensureEncryptionKey()),
  { get: (type) => getChatTransport(type), available: () => availableChatTypes() },
  channelQueue,
  { logger: log, events: eventBus },
);

/** "Add to Slack" (#97): OAuth install that returns the webhook of the channel the user picks. */
export const slackConnectService = new SlackConnectService({
  readConfig: () => readSlackAppConfig(),
  client: new SlackOAuthClient(),
  secret: () => passwordService.ensureEncryptionKey(),
});

export function registerChannelShutdown(): void {
  const scope = globalThis as GlobalWithChannelQueue;
  if (scope[CHANNEL_SHUTDOWN_KEY]) return;
  scope[CHANNEL_SHUTDOWN_KEY] = true;
  process.once('sveltekit:shutdown' as never, () => {
    void channelQueue.drain(10_000);
  });
}

export {
  ExternalRecipientService,
  MAX_EXTERNAL_EMAILS,
  UNSUBSCRIBE_PATH,
  VERIFY_PATH,
  type DeliverableRecipient,
  type ExternalEmailCheck,
} from './application/external-recipient.service';
export type { AllowedDomainsUpdate } from './application/notification-settings.service';
export {
  ExternalRecipientNotFoundError,
  ExternalRecipientStateError,
  InvalidNotificationLinkError,
  NotificationSettingsValidationError,
  VerificationRateLimitedError,
  type ExternalEmailError,
  type ExternalRecipientStatus,
  type ExternalRecipientView,
} from './domain/external-recipient.domain';
export type { NotificationSettings } from './domain/notification-settings.domain';
export {
  NotificationChannelNotFoundError,
  NotificationChannelValidationError,
  MAX_CONSECUTIVE_FAILURES,
  type ChannelLocation,
  type NotificationChannelView,
} from './domain/notification-channel.domain';
export type {
  ChannelInput,
  ChannelMessageSource,
  IssuedChannel,
} from './application/notification-channel.service';
export {
  SLACK_CALLBACK_PATH,
  SLACK_FLOW_COOKIE,
  SLACK_FLOW_COOKIE_PATH,
  SLACK_FLOW_TTL_MS,
  SlackConnectError,
  SlackConnectService,
  type SlackConnectErrorCode,
  type SlackConnectStatus,
  type SlackConnection,
} from './application/slack-connect.service';
export { buildChannelTestMessage } from './infrastructure/channel-test-message';
export { normalizeEmail } from './domain/email-address';
