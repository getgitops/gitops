import { absoluteUrl, notify } from '#lib/server/infra/notifications';
import { RateLimiter } from '#lib/server/infra/rate-limit';
import { createLogger } from '#lib/server/logger';
import { passwordService } from '../auth';
import { organizationService } from '../organization';
import { ExternalRecipientService } from './application/external-recipient.service';
import { NotificationSettingsService } from './application/notification-settings.service';
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
export { normalizeEmail } from './domain/email-address';
