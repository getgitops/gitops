/**
 * Monitoring contracts shared by the API, the embedded worker and the standalone worker
 * (`src/worker/monitoring-worker.ts`). Framework-free: no SvelteKit imports, no path aliases, and
 * only erasable TypeScript so Node runs it as-is (`node src/worker/monitoring-worker.ts`).
 */

export const MONITOR_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const;
export type MonitorMethod = (typeof MONITOR_METHODS)[number];

/** What a single check concluded. `degraded`: answered as expected but slower than the threshold. */
export type CheckStatus = 'up' | 'degraded' | 'down';

/** Status of a monitor over time. `pending`: no check has finished yet; `paused`: disabled. */
export type MonitorStatus = CheckStatus | 'pending' | 'paused';

/** Why a check failed or degraded. */
export type CheckCause =
  | 'timeout'
  | 'dns'
  | 'connection'
  | 'tls'
  | 'unexpected_status'
  | 'slow_response'
  | 'blocked_target'
  | 'too_many_redirects'
  | 'invalid_url'
  | 'error';

/** The HTTP request a check sends. Header values may be secrets: never log or persist them. */
export type CheckRequest = {
  url: string;
  method: MonitorMethod;
  headers: Record<string, string>;
  body: string | null;
  timeoutMs: number;
  /** `200-299`, `200,204` or `301`: what counts as a correct answer. */
  expectedStatus: string;
  /** Latency above this marks the check `degraded`; 0 disables it. */
  degradedThresholdMs: number;
  followRedirects: boolean;
};

export type CheckOutcome = {
  status: CheckStatus;
  cause: CheckCause | null;
  httpStatus: number | null;
  latencyMs: number;
  /** Short, secret-free explanation (`connect ECONNREFUSED`, `expected 200-299, got 503`). */
  error: string | null;
  startedAt: string;
  endedAt: string;
};

/** Extra details the "Test" button shows; workers never send these back. */
export type CheckPreview = {
  responseHeaders: Record<string, string>;
  bodyPreview: string;
  finalUrl: string;
  redirects: number;
};

/** A check handed to a worker: run `request` once and report it with `leaseId`. */
export type LeasedCheck = {
  leaseId: string;
  monitorId: string;
  scheduledAt: string;
  request: CheckRequest;
};

export type LeaseRequest = {
  workerId: string;
  region: string | null;
  /** How many checks the worker can take right now. */
  capacity: number;
};

export type LeaseResponse = {
  checks: LeasedCheck[];
  /** When to ask again if `checks` came back empty. */
  pollAfterMs: number;
};

export type CheckReport = {
  leaseId: string;
  monitorId: string;
  outcome: CheckOutcome;
};

export type ReportRequest = {
  workerId: string;
  region: string | null;
  results: CheckReport[];
};

export type ReportResponse = {
  accepted: number;
  /** Unknown or expired leases: another worker already took them. */
  rejected: number;
};

/** How a worker talks to the scheduler: HTTP for standalone workers, direct calls in-process. */
export interface MonitoringTransport {
  lease(request: LeaseRequest): Promise<LeaseResponse>;
  report(request: ReportRequest): Promise<ReportResponse>;
}
