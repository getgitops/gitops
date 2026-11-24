/**
 * In-memory schedule of every enabled monitor, owned by the single GitOps server process (GitDB
 * already requires one writer). Workers pull due checks through leases:
 *
 * - Each monitor has a stable offset inside its interval (hash of the id), so 10 000 monitors on
 *   a 60 s interval spread over the minute instead of all firing at :00.
 * - `lease()` hands a due check to one caller and moves the schedule to the next slot.
 * - A lease that is not reported before `leasedUntil` (worker died, network) becomes available to
 *   another worker, up to `MAX_ATTEMPTS`; after that the slot is skipped.
 * - A result is accepted once, and only for its current lease.
 *
 * Restarting the server rebuilds the schedule from the monitors; nothing here is persisted.
 */
import { createHash, randomUUID } from 'node:crypto';

export type SchedulableMonitor = { id: string; intervalSeconds: number; timeoutMs: number };

export type GrantedLease = { leaseId: string; monitorId: string; scheduledAt: string };

type Entry = {
  id: string;
  intervalMs: number;
  timeoutMs: number;
  nextRunAt: number;
  pending: { leaseId: string; leasedUntil: number; scheduledAt: number; attempts: number } | null;
};

export type SchedulerStats = { monitors: number; leased: number; overdue: number };

const LEASE_GRACE_MS = 15_000;
const MAX_ATTEMPTS = 2;
export const MAX_LEASE_BATCH = 200;

/** Uniform, stable position of a monitor inside its interval (similar ids don't cluster). */
function stableOffset(id: string, intervalMs: number): number {
  return createHash('sha1').update(id).digest().readUInt32BE(0) % intervalMs;
}

export class MonitorScheduler {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly newId: () => string = randomUUID) {}

  /** Adds or updates a monitor. `immediate`: run its next check now (new or edited monitor). */
  upsert(monitor: SchedulableMonitor, now: number, options: { immediate?: boolean } = {}): void {
    const intervalMs = monitor.intervalSeconds * 1000;
    const existing = this.entries.get(monitor.id);
    if (existing) {
      const intervalChanged = existing.intervalMs !== intervalMs;
      existing.intervalMs = intervalMs;
      existing.timeoutMs = monitor.timeoutMs;
      if (options.immediate) existing.nextRunAt = now;
      else if (intervalChanged) existing.nextRunAt = Math.min(existing.nextRunAt, now + intervalMs);
      return;
    }
    const offset = stableOffset(monitor.id, intervalMs);
    // first check within the interval, at the monitor's own offset in the cycle
    const cycleStart = now - (now % intervalMs);
    let nextRunAt = cycleStart + offset;
    if (nextRunAt < now) nextRunAt += intervalMs;
    this.entries.set(monitor.id, {
      id: monitor.id,
      intervalMs,
      timeoutMs: monitor.timeoutMs,
      nextRunAt: options.immediate ? now : nextRunAt,
      pending: null,
    });
  }

  remove(id: string): void {
    this.entries.delete(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Makes the schedule match `monitors` (adds, updates and drops). */
  sync(monitors: readonly SchedulableMonitor[], now: number): void {
    const ids = new Set(monitors.map((monitor) => monitor.id));
    for (const id of this.entries.keys()) if (!ids.has(id)) this.entries.delete(id);
    for (const monitor of monitors) this.upsert(monitor, now);
  }

  lease(capacity: number, now: number): GrantedLease[] {
    const limit = Math.max(0, Math.min(Math.floor(capacity), MAX_LEASE_BATCH));
    if (limit === 0) return [];

    const due: { entry: Entry; at: number }[] = [];
    for (const entry of this.entries.values()) {
      if (entry.pending) {
        if (entry.pending.leasedUntil > now) continue;
        if (entry.pending.attempts >= MAX_ATTEMPTS) {
          // nobody managed to run this slot: give up on it, the next one is already scheduled
          entry.pending = null;
          if (entry.nextRunAt > now) continue;
        } else {
          due.push({ entry, at: entry.pending.scheduledAt });
          continue;
        }
      }
      if (entry.nextRunAt <= now) due.push({ entry, at: entry.nextRunAt });
    }
    due.sort((a, b) => a.at - b.at);

    return due.slice(0, limit).map(({ entry }) => {
      const leaseId = this.newId();
      const leasedUntil = now + entry.timeoutMs + LEASE_GRACE_MS;
      if (entry.pending) {
        entry.pending = {
          ...entry.pending,
          leaseId,
          leasedUntil,
          attempts: entry.pending.attempts + 1,
        };
      } else {
        const scheduledAt = entry.nextRunAt;
        entry.pending = { leaseId, leasedUntil, scheduledAt, attempts: 1 };
        // next slot; after a long pause (server down) skip the missed ones instead of bursting
        let next = scheduledAt + entry.intervalMs;
        if (next <= now) next = now + entry.intervalMs;
        entry.nextRunAt = next;
      }
      return {
        leaseId,
        monitorId: entry.id,
        scheduledAt: new Date(entry.pending.scheduledAt).toISOString(),
      };
    });
  }

  /** `true` when `leaseId` is the live lease of `monitorId`; it is then released. */
  complete(monitorId: string, leaseId: string): boolean {
    const entry = this.entries.get(monitorId);
    if (!entry?.pending || entry.pending.leaseId !== leaseId) return false;
    entry.pending = null;
    return true;
  }

  /** Milliseconds until the next check is due (for idle workers), capped at `max`. */
  msUntilNextDue(now: number, max: number): number {
    let soonest = max;
    for (const entry of this.entries.values()) {
      const at = entry.pending ? entry.pending.leasedUntil : entry.nextRunAt;
      soonest = Math.min(soonest, Math.max(0, at - now));
    }
    return soonest;
  }

  stats(now: number): SchedulerStats {
    let leased = 0;
    let overdue = 0;
    for (const entry of this.entries.values()) {
      if (entry.pending && entry.pending.leasedUntil > now) leased++;
      else if (entry.nextRunAt < now - 5_000) overdue++;
    }
    return { monitors: this.entries.size, leased, overdue };
  }
}
