export type RetryOptions = {
  /** Total attempts, the first one included. */
  attempts?: number;
  /** Delay before the second attempt; each later delay is `factor` times the previous one. */
  baseDelayMs?: number;
  factor?: number;
  /** ± fraction of each delay added at random, so retries of a burst don't line up. */
  jitter?: number;
  isRetryable?: (error: unknown) => boolean;
  retryAfterMs?: (error: unknown) => number | null | undefined;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn`, retrying retryable failures with exponential backoff. Defaults: 4 attempts, waiting
 * 1 s → 4 s → 16 s (±20 %). A permanent error, or the last attempt's error, is rethrown.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const factor = options.factor ?? 4;
  const jitter = options.jitter ?? 0.2;
  const isRetryable = options.isRetryable ?? (() => true);
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error)) throw error;
      const delay = baseDelayMs * factor ** (attempt - 1);
      const requested = options.retryAfterMs?.(error);
      const delayMs =
        typeof requested === 'number' && requested >= 0
          ? Math.round(requested)
          : Math.max(0, Math.round(delay * (1 + jitter * (random() * 2 - 1))));
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
}

const RETRYABLE_CODES = new Set([
  'ECONNECTION',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'EAI_AGAIN',
  'EPIPE',
]);

/**
 * Whether an SMTP failure may succeed later: network errors, timeouts and temporary (4xx) replies.
 * Permanent replies (5xx, e.g. unknown mailbox), authentication errors and invalid messages are
 * not retried.
 */
export function isRetryableMailError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, responseCode } = error as { code?: unknown; responseCode?: unknown };
  if (typeof responseCode === 'number') return responseCode >= 400 && responseCode < 500;
  return typeof code === 'string' && RETRYABLE_CODES.has(code);
}
