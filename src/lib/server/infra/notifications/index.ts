export { Notification, type NotificationChannel } from './notification';
export { MailNotification, type MailNotificationInput } from './mail-notification';
export { SlackNotification, type SlackNotificationInput } from './slack-notification';
export { notify, registerTransport, resetTransports } from './notify';
export type { NotificationTransport } from './transport';
export {
  renderTemplate,
  renderTemplateString,
  clearTemplateCache,
  renderEmail,
  PRODUCT_NAME,
  type EmailLayout,
  type TemplateVariables,
} from './template';
export {
  absoluteUrl,
  isSmtpConfigured,
  readPublicOrigin,
  readSmtpConfig,
  requireSmtpConfig,
  type SmtpConfig,
} from './config';
export { withRetry, isRetryableMailError, type RetryOptions } from './retry';
export { MailQueue, recipientHash, type MailContext, type MailQueueOptions } from './mail-queue';

import { createLogger } from '#lib/server/logger';
import { MailQueue as Queue } from './mail-queue';
import { notify as send } from './notify';

const QUEUE_KEY = Symbol.for('gitops.mail.queue');
const SHUTDOWN_KEY = Symbol.for('gitops.mail.shutdown');
type GlobalWithQueue = typeof globalThis & { [QUEUE_KEY]?: Queue; [SHUTDOWN_KEY]?: boolean };

/**
 * Process-wide queue for alert and system emails (3 at a time, 4 attempts with backoff). Kept on
 * `globalThis` so HMR doesn't create a second one. Invitations and password resets don't use it:
 * their links carry tokens and are sent directly.
 */
export const mailQueue: Queue = ((globalThis as GlobalWithQueue)[QUEUE_KEY] ??= new Queue({
  send: (notification) => send(notification),
  concurrency: 3,
  logger: createLogger('mail'),
}));

/** Time the shutdown waits for queued emails. */
export const MAIL_SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Drains the queue when adapter-node shuts down (`SIGTERM`/`SIGINT` emit `sveltekit:shutdown`).
 * Registered once per process.
 */
export function registerMailShutdown(): void {
  const scope = globalThis as GlobalWithQueue;
  if (scope[SHUTDOWN_KEY]) return;
  scope[SHUTDOWN_KEY] = true;
  process.once('sveltekit:shutdown' as never, () => {
    void mailQueue.drain(MAIL_SHUTDOWN_TIMEOUT_MS);
  });
}
