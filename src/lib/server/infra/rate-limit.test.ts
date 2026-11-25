import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limit';

describe('RateLimiter', () => {
  it('allows `limit` attempts per window and key, then tells when to retry', () => {
    let now = 0;
    const limiter = new RateLimiter({ limit: 2, windowMs: 1000 }, () => now);

    expect(limiter.consume('a')).toEqual({ allowed: true });
    expect(limiter.consume('a')).toEqual({ allowed: true });
    expect(limiter.consume('a')).toEqual({ allowed: false, retryAfterMs: 1000 });
    expect(limiter.consume('b')).toEqual({ allowed: true });

    now = 400;
    expect(limiter.check('a')).toEqual({ allowed: false, retryAfterMs: 600 });

    now = 1000;
    expect(limiter.consume('a')).toEqual({ allowed: true });
  });

  it('does not count attempts when only checking', () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000 }, () => 0);
    limiter.check('a');
    limiter.check('a');
    expect(limiter.consume('a')).toEqual({ allowed: true });
  });
});
