export type ThrottleDecision =
  | {
      send: true;
      /** Events suppressed in the previous window, to mention in this email. */
      suppressed: number;
    }
  | { send: false };

type Window = { endsAt: number; suppressed: number };

/**
 * Per-alert anti-spam window, in memory (per process, cleared on restart). After an alert fires,
 * it stays quiet for `throttleMinutes`: matching events in that window are only counted, and the
 * next email after the window mentions how many were skipped.
 */
export class AlertThrottle {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  acquire(alertId: string, throttleMinutes: number): ThrottleDecision {
    const now = this.now();
    const current = this.windows.get(alertId);

    if (current && now < current.endsAt) {
      current.suppressed += 1;
      return { send: false };
    }

    const suppressed = current?.suppressed ?? 0;
    if (throttleMinutes > 0) {
      this.windows.set(alertId, { endsAt: now + throttleMinutes * 60_000, suppressed: 0 });
    } else {
      this.windows.delete(alertId);
    }
    return { send: true, suppressed };
  }

  /** Forgets an alert's window (the alert was edited or deleted). */
  reset(alertId?: string): void {
    if (alertId) this.windows.delete(alertId);
    else this.windows.clear();
  }
}
