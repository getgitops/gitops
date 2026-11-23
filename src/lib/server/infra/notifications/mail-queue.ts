import crypto from 'node:crypto';
import type { Logger } from 'pino';
import type { MailNotification } from './mail-notification';
import { isRetryableMailError, withRetry, type RetryOptions } from './retry';

/** What the logs may say about an email: never its content or the address in clear. */
export type MailContext = { alertId?: string; eventId?: string; kind?: string };

type Job = {
  notification: MailNotification;
  context: MailContext;
  done: () => void;
};

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
export class MailQueue {
  private readonly pending: Job[] = [];
  private active = 0;
  private readonly idle = new Set<() => void>();
  private readonly concurrency: number;

  constructor(private readonly options: MailQueueOptions) {
    this.concurrency = Math.max(1, options.concurrency ?? 3);
  }

  /** Queues one email; resolves once it was sent or definitively failed. */
  enqueue(notification: MailNotification, context: MailContext = {}): Promise<void> {
    return new Promise<void>((resolve) => {
      this.pending.push({ notification, context, done: resolve });
      this.pump();
    });
  }

  /** Emails waiting or being sent. */
  get size(): number {
    return this.pending.length + this.active;
  }

  /**
   * Resolves when the queue is empty, or after `timeoutMs` with what is left (`true` when
   * everything was sent).
   */
  drain(timeoutMs = 10_000): Promise<boolean> {
    if (this.size === 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const onIdle = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.idle.delete(onIdle);
        this.options.logger.warn(
          { remaining: this.size },
          '[mail] shutdown timeout: emails left unsent',
        );
        resolve(false);
      }, timeoutMs);
      this.idle.add(onIdle);
    });
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift()!;
      this.active += 1;
      void this.run(job).finally(() => {
        this.active -= 1;
        job.done();
        if (this.size === 0) {
          for (const resolve of [...this.idle]) resolve();
          this.idle.clear();
        } else {
          this.pump();
        }
      });
    }
  }

  private async run(job: Job): Promise<void> {
    const recipients = job.notification.to.map(recipientHash);
    try {
      await withRetry(() => this.options.send(job.notification), {
        isRetryable: isRetryableMailError,
        ...this.options.retry,
        onRetry: (error, attempt, delayMs) =>
          this.options.logger.debug(
            { ...job.context, recipients, attempt, delayMs, code: errorCode(error) },
            '[mail] retrying email',
          ),
      });
    } catch (error) {
      this.options.logger.error(
        // only the error code: SMTP messages may quote the recipient address
        { ...job.context, recipients, code: errorCode(error) },
        '[mail] email could not be sent',
      );
    }
  }
}

function errorCode(error: unknown): unknown {
  if (!error || typeof error !== 'object') return undefined;
  const { code, responseCode } = error as { code?: unknown; responseCode?: unknown };
  return responseCode ?? code;
}
