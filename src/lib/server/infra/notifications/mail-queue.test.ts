import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailNotification } from './mail-notification';
import { MailQueue, recipientHash } from './mail-queue';
import { isRetryableMailError, withRetry } from './retry';

function mail(to: string) {
  return new MailNotification({ to, subject: 'Alert', content: '<p>secret details</p>' });
}

function smtpError(props: { code?: string; responseCode?: number }) {
  return Object.assign(new Error('smtp failure for someone@example.com'), props);
}

function logger() {
  return { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe('isRetryableMailError', () => {
  it.each([
    [{ code: 'ETIMEDOUT' }, true],
    [{ code: 'ECONNECTION' }, true],
    [{ code: 'ESOCKET' }, true],
    [{ responseCode: 421 }, true],
    [{ responseCode: 451 }, true],
    [{ responseCode: 550 }, false],
    [{ responseCode: 553 }, false],
    [{ code: 'EAUTH' }, false],
    [{ code: 'EENVELOPE' }, false],
  ])('%j → %s', (props, expected) => {
    expect(isRetryableMailError(smtpError(props))).toBe(expected);
  });

  it('does not retry plain errors (validation)', () => {
    expect(isRetryableMailError(new Error('MailNotification requires a subject'))).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits 1 s → 4 s → 16 s between the 4 attempts', async () => {
    const fn = vi.fn().mockRejectedValue(smtpError({ code: 'ETIMEDOUT' }));
    const delays: number[] = [];
    const promise = withRetry(fn, {
      isRetryable: isRetryableMailError,
      random: () => 0.5, // no jitter
      onRetry: (_error, _attempt, delayMs) => delays.push(delayMs),
    });
    const settled = promise.catch((error) => error);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(16000);
    expect(fn).toHaveBeenCalledTimes(4);

    expect(await settled).toMatchObject({ code: 'ETIMEDOUT' });
    expect(delays).toEqual([1000, 4000, 16000]);
  });

  it('applies jitter around each delay', async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue('ok');
    const promise = withRetry(fn, { random: () => 1, onRetry: (_e, _a, d) => delays.push(d) });
    await vi.advanceTimersByTimeAsync(1200);
    await expect(promise).resolves.toBe('ok');
    expect(delays).toEqual([1200]);
  });

  it('fails at once on permanent errors', async () => {
    const fn = vi.fn().mockRejectedValue(smtpError({ responseCode: 550 }));
    await expect(withRetry(fn, { isRetryable: isRetryableMailError })).rejects.toMatchObject({
      responseCode: 550,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('MailQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends one email per job with at most `concurrency` at a time', async () => {
    let active = 0;
    let peak = 0;
    const sent: string[] = [];
    const queue = new MailQueue({
      concurrency: 3,
      logger: logger(),
      send: async (notification) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 100));
        sent.push(notification.to[0]);
        active -= 1;
      },
    });

    const jobs = Array.from({ length: 7 }, (_, i) => queue.enqueue(mail(`user${i}@example.com`)));
    expect(queue.size).toBe(7);
    await vi.advanceTimersByTimeAsync(300);
    await Promise.all(jobs);

    expect(sent).toHaveLength(7);
    expect(new Set(sent).size).toBe(7);
    expect(peak).toBe(3);
    expect(queue.size).toBe(0);
  });

  it('retries temporary failures and logs a definitive one without content or address', async () => {
    const log = logger();
    const send = vi
      .fn()
      .mockRejectedValueOnce(smtpError({ code: 'ECONNECTION' }))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(smtpError({ responseCode: 550 }));
    const queue = new MailQueue({ send, logger: log, retry: { random: () => 0.5 } });

    const first = queue.enqueue(mail('ok@example.com'), { alertId: 'a1', eventId: 'e1' });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(first).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(log.error).not.toHaveBeenCalled();

    await expect(
      queue.enqueue(mail('gone@example.com'), { alertId: 'a1', eventId: 'e2' }),
    ).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
    expect(log.error).toHaveBeenCalledTimes(1);
    const [fields] = log.error.mock.calls[0];
    expect(fields).toEqual({
      alertId: 'a1',
      eventId: 'e2',
      recipients: [recipientHash('gone@example.com')],
      code: 550,
    });
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('gone@example.com');
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('secret details');
  });

  it('drains pending emails on shutdown, up to a time limit', async () => {
    const send = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 2000)));
    const queue = new MailQueue({ send, concurrency: 1, logger: logger() });
    void queue.enqueue(mail('a@example.com'));
    void queue.enqueue(mail('b@example.com'));

    const drained = queue.drain(10_000);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(drained).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);

    const log = logger();
    const slow = new MailQueue({
      send: () => new Promise<void>((resolve) => setTimeout(resolve, 60_000)),
      logger: log,
    });
    void slow.enqueue(mail('c@example.com'));
    const timedOut = slow.drain(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(timedOut).resolves.toBe(false);
    expect(log.warn).toHaveBeenCalledWith({ remaining: 1 }, expect.any(String));
  });

  it('resolves drain at once when idle', async () => {
    await expect(new MailQueue({ send: vi.fn(), logger: logger() }).drain()).resolves.toBe(true);
  });
});
