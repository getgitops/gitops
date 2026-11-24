export type RateLimitRule = {
  /** Attempts allowed per window. */
  limit: number;
  windowMs: number;
};

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * In-memory fixed-window rate limiter keyed by an arbitrary string (an address, an
 * organization…). Per process and cleared on restart: it slows abuse down, it is not an exact
 * quota. Expired windows are pruned on use, so memory stays bounded by active keys.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** What `consume(key)` would answer, without counting an attempt. */
  check(key: string): RateLimitDecision {
    const window = this.current(key);
    if (window && window.count >= this.rule.limit) {
      return { allowed: false, retryAfterMs: window.resetAt - this.now() };
    }
    return { allowed: true };
  }

  /** Counts one attempt for `key` when it is allowed. */
  consume(key: string): RateLimitDecision {
    const decision = this.check(key);
    if (!decision.allowed) return decision;
    const window = this.current(key);
    if (window) window.count += 1;
    else this.windows.set(key, { count: 1, resetAt: this.now() + this.rule.windowMs });
    return decision;
  }

  reset(): void {
    this.windows.clear();
  }

  private current(key: string) {
    const now = this.now();
    if (this.windows.size > 1000) {
      for (const [candidate, window] of this.windows) {
        if (window.resetAt <= now) this.windows.delete(candidate);
      }
    }
    const window = this.windows.get(key);
    if (window && window.resetAt <= now) {
      this.windows.delete(key);
      return undefined;
    }
    return window;
  }
}
