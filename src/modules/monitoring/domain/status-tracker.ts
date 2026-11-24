import type { CheckOutcome, CheckStatus, MonitorStatus } from '#lib/monitoring/types';

/**
 * Live status of one monitor, derived from its checks:
 *
 * - `up` → `down`/`degraded` only after `confirmations` consecutive checks agree, so a single
 *   blip never opens an incident. The incident starts at the first of those checks, so the
 *   downtime it accounts for is accurate.
 * - `down` ↔ `degraded` switches after the same confirmation.
 * - Any `up` check closes the incident right away.
 */
export type TrackedState = {
  status: MonitorStatus;
  /** When the current status started (ISO). */
  since: string | null;
  /** Open incident while `status` is `down` or `degraded`. */
  incidentId: string | null;
  /** Consecutive checks not matching `status`, with the first of them. */
  streak: { status: CheckStatus; count: number; firstAt: string; outcome: CheckOutcome } | null;
  failedChecks: number;
  lastCheck: CheckOutcome | null;
};

export type Transition =
  | {
      kind: 'opened';
      status: 'down' | 'degraded';
      previous: MonitorStatus;
      startedAt: string;
      outcome: CheckOutcome;
    }
  | {
      kind: 'changed';
      status: 'down' | 'degraded';
      previous: 'down' | 'degraded';
      startedAt: string;
      outcome: CheckOutcome;
      closedIncidentId: string;
      /** Failing checks of the incident being closed. */
      closedFailedChecks: number;
    }
  | {
      kind: 'recovered';
      previous: 'down' | 'degraded';
      closedIncidentId: string;
      closedFailedChecks: number;
      endedAt: string;
      since: string | null;
      outcome: CheckOutcome;
    };

export function initialState(status: MonitorStatus = 'pending'): TrackedState {
  return { status, since: null, incidentId: null, streak: null, failedChecks: 0, lastCheck: null };
}

/** Applies one check to `state` (mutated) and returns what changed, if anything. */
export function applyCheck(
  state: TrackedState,
  outcome: CheckOutcome,
  confirmations: number,
): Transition | null {
  state.lastCheck = outcome;
  const current = state.status;
  const needed = Math.max(1, confirmations);

  if (outcome.status === 'up') {
    state.streak = null;
    if (current === 'down' || current === 'degraded') {
      const closedIncidentId = state.incidentId!;
      const closedFailedChecks = state.failedChecks;
      const since = state.since;
      state.status = 'up';
      state.since = outcome.startedAt;
      state.incidentId = null;
      state.failedChecks = 0;
      return {
        kind: 'recovered',
        previous: current,
        closedIncidentId,
        closedFailedChecks,
        endedAt: outcome.startedAt,
        since,
        outcome,
      };
    }
    if (current !== 'up') {
      state.status = 'up';
      state.since = outcome.startedAt;
    }
    return null;
  }

  // failing check (down or degraded)
  if (current === outcome.status) {
    state.streak = null;
    state.failedChecks++;
    return null;
  }

  if (state.streak?.status === outcome.status) {
    state.streak.count++;
  } else {
    state.streak = { status: outcome.status, count: 1, firstAt: outcome.startedAt, outcome };
  }
  if (state.streak.count < needed) return null;

  const startedAt = state.streak.firstAt;
  const failed = state.streak.count;
  const closedFailedChecks = state.failedChecks;
  state.streak = null;
  state.status = outcome.status;
  state.since = startedAt;
  state.failedChecks = failed;

  if (current === 'down' || current === 'degraded') {
    const closedIncidentId = state.incidentId!;
    state.incidentId = null;
    return {
      kind: 'changed',
      status: outcome.status,
      previous: current,
      startedAt,
      outcome,
      closedIncidentId,
      closedFailedChecks,
    };
  }
  return { kind: 'opened', status: outcome.status, previous: current, startedAt, outcome };
}
