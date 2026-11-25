import {
  DeliveryQueue,
  type ChatChannelType,
  type ChatNotification,
  type ChatTransport,
} from '#lib/server/infra/notifications';
import {
  isRetryableWebhookError,
  validateWebhookUrl,
  webhookRetryAfter,
  WebhookDeliveryError,
} from '#lib/server/infra/http/webhook-request';
import { InMemoryNotificationChannelRepository } from '../infrastructure/repositories/in-memory.repositories';
import { createChannelCipher } from '../infrastructure/crypto/channel-cipher';
import { NotificationChannelService, type ChannelDelivery } from './notification-channel.service';
import { RateLimiter } from '#lib/server/infra/rate-limit';
import {
  InMemoryExternalRecipientRepository,
  InMemoryNotificationSettingsRepository,
} from '../infrastructure/repositories/in-memory.repositories';
import {
  ExternalRecipientService,
  type ExternalRecipientNotifierPort,
  type VerificationEmail,
} from './external-recipient.service';
import { NotificationSettingsService } from './notification-settings.service';

export class RecordingVerificationNotifier implements ExternalRecipientNotifierPort {
  sent: VerificationEmail[] = [];
  fail = false;

  async sendVerification(email: VerificationEmail) {
    if (this.fail) throw new Error('SMTP down');
    this.sent.push(email);
  }

  /** Token of the last confirmation link sent to `email`. */
  tokenFor(email: string): string {
    const last = [...this.sent].reverse().find((item) => item.email === email);
    if (!last) throw new Error(`no verification sent to ${email}`);
    return new URL(last.verifyUrl).searchParams.get('token')!;
  }
}

/** The notifications module wired with in-memory repositories and a controllable clock. */
export function createNotificationsFixture(options: { origin?: string | null } = {}) {
  const clock = { now: new Date('2026-11-24T10:00:00.000Z') };
  const origin = options.origin === undefined ? 'https://gitops.example.com' : options.origin;
  const settingsRepository = new InMemoryNotificationSettingsRepository();
  const recipientRepository = new InMemoryExternalRecipientRepository();
  const notifier = new RecordingVerificationNotifier();
  let id = 0;
  const time = () => clock.now.getTime();
  const recipients = new ExternalRecipientService(
    recipientRepository,
    settingsRepository,
    notifier,
    {
      secret: () => 'test-encryption-key',
      absoluteUrl: (path) => (origin ? `${origin}${path}` : null),
      now: () => clock.now,
      generateId: () => `recipient-${++id}`,
      perAddressLimiter: new RateLimiter({ limit: 3, windowMs: 60 * 60 * 1000 }, time),
      perOrganizationLimiter: new RateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 }, time),
    },
  );
  const settings = new NotificationSettingsService(settingsRepository, recipients);
  return {
    clock,
    settingsRepository,
    recipientRepository,
    notifier,
    recipients,
    settings,
    advance(ms: number) {
      clock.now = new Date(clock.now.getTime() + ms);
    },
  };
}

export class FakeChatTransport implements ChatTransport {
  sent: ChatNotification[] = [];
  failWith: Array<number | 'network'> = [];

  validateDestination(raw: unknown) {
    return validateWebhookUrl(raw, { hosts: ['hooks.example.com'], pathPrefix: '/hook/' });
  }

  async send(notification: ChatNotification) {
    const failure = this.failWith.shift();
    if (failure === 'network') throw new WebhookDeliveryError(null, true, null, 'network');
    if (typeof failure === 'number') {
      throw new WebhookDeliveryError(failure, failure === 429 || failure >= 500);
    }
    this.sent.push(notification);
  }
}

export function createChannelsFixture(
  options: {
    types?: ChatChannelType[];
    logger?: { warn: () => void; error: () => void; debug: () => void };
  } = {},
) {
  const clock = { now: new Date('2026-11-24T10:00:00.000Z') };
  const repository = new InMemoryNotificationChannelRepository();
  const transport = new FakeChatTransport();
  const types = options.types ?? ['slack'];
  const logger = options.logger ?? { warn: () => {}, error: () => {}, debug: () => {} };
  const queue = new DeliveryQueue<ChannelDelivery>({
    send: (delivery) =>
      transport.send({
        channel: delivery.type,
        destination: delivery.destination,
        message: delivery.message,
      } as ChatNotification),
    retry: {
      isRetryable: isRetryableWebhookError,
      retryAfterMs: webhookRetryAfter,
      sleep: async () => {},
    },
    logger,
    label: { prefix: '[channels]', noun: 'message', plural: 'messages' },
    describe: (delivery) => ({ channelId: delivery.channelId, type: delivery.type }),
    onSettled: (delivery, outcome) => delivery.report(outcome),
  });
  let id = 0;
  const service = new NotificationChannelService(
    repository,
    createChannelCipher(() => 'test-encryption-key'),
    {
      get: (type) => (types.includes(type) ? transport : null),
      available: () => [...types],
    },
    queue,
    { now: () => clock.now, generateId: () => `channel-${++id}` },
  );
  return {
    clock,
    repository,
    transport,
    service,
    advance(ms: number) {
      clock.now = new Date(clock.now.getTime() + ms);
    },
  };
}
