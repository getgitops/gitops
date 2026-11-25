import {
  ChatNotification,
  DeliveryQueue,
  absoluteUrl,
  availableChatTypes,
  getChatTransport,
  notify,
  sendWithLatestNotify,
} from '#lib/server/infra/notifications';
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

const CHANNEL_QUEUE_KEY = Symbol.for('gitops.notifications.channel-queue');
const CHANNEL_SHUTDOWN_KEY = Symbol.for('gitops.notifications.channel-shutdown');
type GlobalWithChannelQueue = typeof globalThis & {
  [CHANNEL_QUEUE_KEY]?: DeliveryQueue<ChannelDelivery>;
  [CHANNEL_SHUTDOWN_KEY]?: boolean;
};

export const channelQueue: DeliveryQueue<ChannelDelivery> = ((globalThis as GlobalWithChannelQueue)[
  CHANNEL_QUEUE_KEY
] ??= new DeliveryQueue<ChannelDelivery>({
  send: (delivery) =>
    sendWithLatestNotify(
      new ChatNotification({
        channel: delivery.type,
        destination: delivery.destination,
        message: delivery.message,
      }),
    ),
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
  { logger: log },
);

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
  type ChannelLocation,
  type NotificationChannelView,
} from './domain/notification-channel.domain';
export type { ChannelInput } from './application/notification-channel.service';
export { buildChannelTestMessage } from './infrastructure/channel-test-message';
export { normalizeEmail } from './domain/email-address';
