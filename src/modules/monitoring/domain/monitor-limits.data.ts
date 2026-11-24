import { DEFAULT_EXPECTED_STATUS } from '#lib/monitoring/expected-status';

export const MONITOR_DEFAULTS = {
  method: 'GET',
  intervalSeconds: 60,
  timeoutMs: 10_000,
  expectedStatus: DEFAULT_EXPECTED_STATUS,
  degradedThresholdMs: 2_000,
  confirmations: 2,
  followRedirects: true,
  enabled: true,
} as const;

export const MONITOR_LIMITS = {
  nameMaxLength: 120,
  urlMaxLength: 2_048,
  intervalSeconds: { min: 30, max: 3_600 },
  timeoutMs: { min: 1_000, max: 30_000 },
  degradedThresholdMs: { min: 0, max: 60_000 },
  confirmations: { min: 1, max: 10 },
  maxHeaders: 30,
  headerNameMaxLength: 128,
  headerValueMaxLength: 8_192,
  bodyMaxLength: 64 * 1024,
} as const;

/** Intervals offered in the form; any value inside the limits is accepted by the API. */
export const MONITOR_INTERVAL_OPTIONS = [30, 60, 120, 300, 600, 900, 1800, 3600] as const;

/** Checks kept in memory per monitor for the live view (lost on restart, never persisted). */
export const RECENT_CHECKS_PER_MONITOR = 120;
