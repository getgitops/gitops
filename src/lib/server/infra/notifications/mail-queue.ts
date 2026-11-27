import crypto from 'node:crypto';
import type { Logger } from 'pino';
import { DeliveryQueue } from './delivery-queue';
import type { MailNotification } from './mail-notification';
import { isRetryableMailError, type RetryOptions } from './retry';

/** What the logs may say about an email: never its content or the address in clear. */
export type MailContext = { alertId?: string; eventId?: string; kind?: string };

export type MailQueueOptions = {
  send: (notification: MailNotification) => Promise<void>;
  /** Emails sent at the same time; a burst of events waits in the queue. */
  concurrency?: number;
  retry?: RetryOptions;
  logger: Pick<Logger, 'warn' | 'error' | 'debug'>;
};

/** Short, stable hash of an address, to correlate log lines without logging the address. */
export function recipientHash(address: string): string {
  return crypto
    .createHash('sha256')
    .update(address.trim().toLowerCase())
    .digest('hex')
    .slice(0, 12);
}

/**
 * In-process email queue with limited concurrency and retries (`withRetry`, SMTP-aware). Each job
 * is one email; a definitive failure is logged and dropped, never thrown at the caller. Per
 * process: pending emails are lost on a crash, and `drain()` flushes them on shutdown.
 */
export class MailQueue extends DeliveryQueue<MailNotification> {
  constructor(options: MailQueueOptions) {
    super({
      send: options.send,
      concurrency: options.concurrency,
      retry: { isRetryable: isRetryableMailError, ...options.retry },
      logger: options.logger,
      label: { prefix: '[mail]', noun: 'email', plural: 'emails' },
      describe: (notification) => ({ recipients: notification.to.map(recipientHash) }),
    });
  }

  enqueue(notification: MailNotification, context: MailContext = {}): Promise<boolean> {
    return super.enqueue(notification, context);
  }
}
