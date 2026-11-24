import type { Logger } from 'pino';
import { withRetry, type RetryOptions } from './retry';

type Job<T> = {
  item: T;
  context: Record<string, unknown>;
  done: (sent: boolean) => void;
};

export type DeliveryQueueOptions<T> = {
  /** Delivers one item; a rejection is retried when `retry.isRetryable` allows it. */
  send: (item: T) => Promise<void>;
  /** Deliveries in flight at the same time; a burst waits in the queue. */
  concurrency?: number;
  retry?: RetryOptions;
  logger: Pick<Logger, 'warn' | 'error' | 'debug'>;
  /** Log prefix and noun: `[mail]` / `email`, `[channels]` / `message`. */
  label: { prefix: string; noun: string; plural: string };
  /** Extra log fields for an item; never its content nor a secret destination. */
  describe?: (item: T) => Record<string, unknown>;
  /** Short code of a definitive failure for the logs (never a message: it may quote secrets). */
  errorCode?: (error: unknown) => unknown;
  /** Called once per item after its last attempt. */
  onSettled?: (item: T, outcome: { sent: true } | { sent: false; error: unknown }) => void;
};

/**
 * In-process delivery queue with limited concurrency and retries (`withRetry`). Each job is one
 * delivery; a definitive failure is logged and dropped, never thrown at the caller. Per process:
 * pending jobs are lost on a crash, and `drain()` flushes them on shutdown.
 */
export class DeliveryQueue<T> {
  private readonly pending: Job<T>[] = [];
  private active = 0;
  private readonly idle = new Set<() => void>();
  private readonly concurrency: number;

  constructor(protected readonly options: DeliveryQueueOptions<T>) {
    this.concurrency = Math.max(1, options.concurrency ?? 3);
  }

  /**
   * Queues one delivery; resolves once it succeeded (`true`) or definitively failed (`false`,
   * already logged). It never rejects.
   */
  enqueue(item: T, context: Record<string, unknown> = {}): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.pending.push({ item, context, done: resolve });
      this.pump();
    });
  }

  /** Deliveries waiting or in flight. */
  get size(): number {
    return this.pending.length + this.active;
  }

  /**
   * Resolves when the queue is empty, or after `timeoutMs` with what is left (`true` when
   * everything was delivered).
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
        const { prefix, plural } = this.options.label;
        this.options.logger.warn(
          { remaining: this.size },
          `${prefix} shutdown timeout: ${plural} left unsent`,
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
      let sent = false;
      void this.run(job)
        .then((result) => {
          sent = result;
        })
        .finally(() => {
          this.active -= 1;
          job.done(sent);
          if (this.size === 0) {
            for (const resolve of [...this.idle]) resolve();
            this.idle.clear();
          } else {
            this.pump();
          }
        });
    }
  }

  private async run(job: Job<T>): Promise<boolean> {
    const { prefix, noun } = this.options.label;
    const fields = { ...job.context, ...this.options.describe?.(job.item) };
    const code = this.options.errorCode ?? defaultErrorCode;
    try {
      await withRetry(() => this.options.send(job.item), {
        ...this.options.retry,
        onRetry: (error, attempt, delayMs) =>
          this.options.logger.debug(
            { ...fields, attempt, delayMs, code: code(error) },
            `${prefix} retrying ${noun}`,
          ),
      });
      this.options.onSettled?.(job.item, { sent: true });
      return true;
    } catch (error) {
      this.options.logger.error(
        { ...fields, code: code(error) },
        `${prefix} ${noun} could not be sent`,
      );
      this.options.onSettled?.(job.item, { sent: false, error });
      return false;
    }
  }
}

/** The error's code, HTTP/SMTP status or name; never its message. */
export function defaultErrorCode(error: unknown): unknown {
  if (!error || typeof error !== 'object') return undefined;
  const { code, responseCode, status, name } = error as {
    code?: unknown;
    responseCode?: unknown;
    status?: unknown;
    name?: unknown;
  };
  return responseCode ?? status ?? code ?? name;
}
