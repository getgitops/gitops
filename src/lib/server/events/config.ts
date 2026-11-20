import * as env from '$app/env/private';

export const DEFAULT_EVENTS_EXPIRATION = '7d';

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/**
 * Parses a duration such as `30d`, `12h`, `45m` or `90s` (a bare number means seconds) into
 * milliseconds. Returns `null` for anything else.
 */
export function parseDuration(value: string): number | null {
  const match = /^(\d+)\s*([smhd]?)$/i.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const unit = (match[2] || 's').toLowerCase() as keyof typeof UNIT_MS;
  return amount * UNIT_MS[unit];
}

/**
 * How long the organization events page keeps events (`GITOPS_EVENTS_EXPIRATION`, default 7 days).
 * An invalid value falls back to the default and is reported through `onInvalid`.
 */
export function readEventsExpirationMs(onInvalid?: (value: string) => void): number {
  const raw = env.GITOPS_EVENTS_EXPIRATION?.trim();
  const fallback = parseDuration(DEFAULT_EVENTS_EXPIRATION)!;
  if (!raw) return fallback;
  const parsed = parseDuration(raw);
  if (parsed === null) {
    onInvalid?.(raw);
    return fallback;
  }
  return parsed;
}
