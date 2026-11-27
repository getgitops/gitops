import type { IacSnapshot, IacUpdate } from '../domain/iac.model';
import type { IacDiff, IacDiffSummary } from './state-diff.service';
import type { StackListItem } from './state-iac.service';

/**
 * Pure functions behind the per-stack dashboard of a project (docs/adr/0003-state-iac.md): health
 * of a stack, KPIs, weekly deploy buckets, resources by type, last changes and warnings across the
 * environments (stacks) of a project. Nothing here reads a bucket: the service gives it what the
 * viewer is allowed to see (`null` = not readable) and `now` is injected.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const STALE_LOCK_MS = HOUR_MS;
export const INACTIVE_MS = 30 * DAY_MS;
export const SUCCESS_WINDOW_DAYS = 30;
export const DEPLOY_WEEKS = 13;
export const TOP_TYPES = 8;
export const RECENT_UPDATES = 5;
export const CHANGED_RESOURCES = 8;
export const CHANGED_FIELD_PATHS = 2;
const STACK_TYPE = 'pulumi:pulumi:Stack';

export type StackHealthReason =
  | 'read_error'
  | 'backend_error'
  | 'last_update_failed'
  | 'pending_operations'
  | 'stale_lock'
  | 'inactive';

export type StackHealth = { level: 'ok' | 'warn' | 'critical'; reasons: StackHealthReason[] };

export type HealthInput = Pick<
  StackListItem,
  'error' | 'pendingOperations' | 'lock' | 'lastUpdate' | 'updatedAt'
>;

const time = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/** When an update happened (its end, else its start). */
const updateTime = (update: IacUpdate) => time(update.endedAt) ?? time(update.startedAt);

export function stackHealth(
  stack: HealthInput,
  backendError: string | null,
  now: number,
): StackHealth {
  const reasons: StackHealthReason[] = [];
  if (stack.error) reasons.push('read_error');
  if (backendError) reasons.push('backend_error');
  if (stack.lastUpdate?.result === 'failed') reasons.push('last_update_failed');
  if (stack.pendingOperations > 0) reasons.push('pending_operations');
  const critical = reasons.length > 0;

  const lockSince = time(stack.lock?.since);
  if (lockSince !== null && now - lockSince > STALE_LOCK_MS) reasons.push('stale_lock');
  const last = stack.lastUpdate ? updateTime(stack.lastUpdate) : time(stack.updatedAt);
  if (last !== null && now - last > INACTIVE_MS) reasons.push('inactive');

  return { level: critical ? 'critical' : reasons.length > 0 ? 'warn' : 'ok', reasons };
}

export type DashboardResources = {
  /** Every resource but the stack root: managed + components. */
  total: number;
  managed: number;
  components: number;
  protected: number;
  pendingChange: number;
  topTypes: { type: string; count: number }[];
  /** Resources of the types that are not in `topTypes`. */
  otherCount: number;
  byProvider: { provider: string; count: number }[];
};

export type DashboardWeek = {
  /** Monday 00:00 UTC of the week. */
  start: string;
  succeeded: number;
  failed: number;
};

export type DashboardDeployments = {
  recent: IacUpdate[];
  window: { days: number; total: number; succeeded: number; rate: number | null };
  perWeek: number | null;
  weeks: DashboardWeek[];
};

export type DashboardChangedResource = {
  address: string;
  type: string;
  name: string;
  change: 'create' | 'delete' | 'update' | 'replace';
  paths: string[];
};

export type DashboardLastChanges = {
  summary: IacDiffSummary;
  resources: DashboardChangedResource[];
  /** Changed resources that did not fit in `resources`. */
  moreCount: number;
  providerOnlyCount: number;
  from: string | null;
  to: string | null;
};

export type StackDashboard = {
  health: StackHealth;
  /** From the state (`states:read`). */
  resources: DashboardResources | null;
  /** The last update and what it changed (it comes with the stack summary). */
  lastUpdate: IacUpdate | null;
  /** From the history (`history:read`). */
  deployments: DashboardDeployments | null;
  /** From the default diff (`states:read`); `null` without permission. */
  lastChanges: DashboardLastChanges | null;
  /** `resourceChanges` of the last update: the fallback when there is nothing to compare with. */
  updateChanges: IacUpdate['changes'] | null;
};

export type BuildDashboardInput = {
  summary: StackListItem;
  snapshot: IacSnapshot | null;
  updates: IacUpdate[] | null;
  diff: IacDiff | null;
  backendError: string | null;
  now: number;
};

export function buildDashboard(input: BuildDashboardInput): StackDashboard {
  const { summary, snapshot, updates, diff, backendError, now } = input;
  return {
    health: stackHealth(summary, backendError, now),
    resources: snapshot ? resourceStats(snapshot) : null,
    lastUpdate: summary.lastUpdate,
    deployments: updates ? deployments(updates, now) : null,
    lastChanges: diff ? lastChanges(diff) : null,
    updateChanges: summary.lastUpdate?.changes ?? null,
  };
}

function resourceStats(snapshot: IacSnapshot): DashboardResources {
  const own = snapshot.resources.filter((resource) => resource.type !== STACK_TYPE);
  const byType = new Map<string, number>();
  const byProvider = new Map<string, number>();
  for (const resource of own) {
    byType.set(resource.type, (byType.get(resource.type) ?? 0) + 1);
    if (resource.managed && resource.providerType) {
      byProvider.set(resource.providerType, (byProvider.get(resource.providerType) ?? 0) + 1);
    }
  }
  const sorted = [...byType.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  const top = sorted.slice(0, TOP_TYPES);
  return {
    total: own.length,
    managed: own.filter((r) => r.managed).length,
    components: own.filter((r) => !r.managed).length,
    protected: own.filter((r) => r.flags.protect).length,
    pendingChange: own.filter((r) => r.flags.pendingReplacement || r.flags.pendingDelete).length,
    topTypes: top,
    otherCount: sorted.slice(TOP_TYPES).reduce((sum, entry) => sum + entry.count, 0),
    byProvider: [...byProvider.entries()]
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count || a.provider.localeCompare(b.provider)),
  };
}

/** Monday 00:00 UTC of the week of `timestamp`. */
export function weekStart(timestamp: number): number {
  const day = new Date(timestamp);
  const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return midnight - sinceMonday * DAY_MS;
}

function deployments(updates: IacUpdate[], now: number): DashboardDeployments {
  const finished = updates.filter((u) => u.result === 'succeeded' || u.result === 'failed');
  const currentWeek = weekStart(now);
  const weeks: DashboardWeek[] = Array.from({ length: DEPLOY_WEEKS }, (_, index) => ({
    start: new Date(currentWeek - (DEPLOY_WEEKS - 1 - index) * 7 * DAY_MS).toISOString(),
    succeeded: 0,
    failed: 0,
  }));
  const first = Date.parse(weeks[0].start);
  const windowStart = now - SUCCESS_WINDOW_DAYS * DAY_MS;
  let total = 0;
  let succeeded = 0;
  for (const update of finished) {
    const at = updateTime(update);
    if (at === null || at > now) continue;
    if (at >= first) {
      const bucket = weeks[Math.floor((weekStart(at) - first) / (7 * DAY_MS))];
      if (bucket) bucket[update.result === 'succeeded' ? 'succeeded' : 'failed'] += 1;
    }
    if (at >= windowStart) {
      total += 1;
      if (update.result === 'succeeded') succeeded += 1;
    }
  }
  return {
    recent: updates.slice(0, RECENT_UPDATES),
    window: {
      days: SUCCESS_WINDOW_DAYS,
      total,
      succeeded,
      rate: total > 0 ? succeeded / total : null,
    },
    perWeek: total > 0 ? Math.round((total / (SUCCESS_WINDOW_DAYS / 7)) * 10) / 10 : null,
    weeks,
  };
}

function lastChanges(diff: IacDiff): DashboardLastChanges {
  const changed = diff.resources.filter((resource) => !resource.providerOnly);
  return {
    summary: diff.summary,
    resources: changed.slice(0, CHANGED_RESOURCES).map((resource) => ({
      address: resource.address,
      type: resource.type,
      name: resource.name,
      change: resource.change,
      paths: resource.fields.slice(0, CHANGED_FIELD_PATHS).map((field) => field.path),
    })),
    moreCount: Math.max(0, changed.length - CHANGED_RESOURCES),
    providerOnlyCount: diff.resources.length - changed.length,
    from: diff.from.sourceId,
    to: diff.to.sourceId,
  };
}

export type EnvironmentRef = { project: string | null; stack: string };

export type EnvironmentWarning =
  | { kind: 'version_drift'; stacks: (EnvironmentRef & { version: string })[] }
  | { kind: 'stack_failed'; stack: EnvironmentRef; at: string | null }
  | { kind: 'stale_lock'; stack: EnvironmentRef; since: string };

/**
 * Warnings across the stacks of a project: Pulumi versions that differ, another stack whose last
 * update failed and locks held for too long. `selected` is the stack being looked at (its own
 * failure is already its health).
 */
export function environmentWarnings(
  stacks: StackListItem[],
  selected: { backendId: string; project: string | null; stack: string },
  now: number,
): EnvironmentWarning[] {
  const warnings: EnvironmentWarning[] = [];
  const named = (stack: StackListItem): EnvironmentRef => ({
    project: stack.ref.project,
    stack: stack.ref.stack,
  });

  const versions = stacks.flatMap((stack) =>
    stack.toolVersion ? [{ ...named(stack), version: stack.toolVersion }] : [],
  );
  if (new Set(versions.map((entry) => entry.version)).size > 1) {
    warnings.push({ kind: 'version_drift', stacks: versions });
  }

  for (const stack of stacks) {
    const isSelected =
      stack.ref.backendId === selected.backendId &&
      stack.ref.project === selected.project &&
      stack.ref.stack === selected.stack;
    if (!isSelected && stack.lastUpdate?.result === 'failed') {
      warnings.push({
        kind: 'stack_failed',
        stack: named(stack),
        at: stack.lastUpdate.endedAt ?? stack.lastUpdate.startedAt,
      });
    }
  }

  for (const stack of stacks) {
    const since = time(stack.lock?.since);
    if (since !== null && stack.lock?.since && now - since > STALE_LOCK_MS) {
      warnings.push({ kind: 'stale_lock', stack: named(stack), since: stack.lock.since });
    }
  }
  return warnings;
}
