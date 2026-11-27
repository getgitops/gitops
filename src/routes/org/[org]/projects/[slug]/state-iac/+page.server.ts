import { error } from '@sveltejs/kit';
import { environmentWarnings, stackHealth } from '#modules/state-iac';
import {
  canReadHistory,
  canReadStacks,
  canReadStates,
  getProjectDashboard,
  getStack,
  listStacks,
  projectCoversStack,
  type StackScope,
} from '#lib/server/state-iac/stacks';
import {
  parseStackKey,
  stackKey,
  type EnvironmentView,
  type StackListing,
  type StackPanel,
} from '#lib/state-iac/types';

/** A streamed promise must never reject: an unhandled rejection would take the server down. */
async function safe<T extends { kind: string }>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}

/**
 * Permissions and visibility (GitDB only) are decided here; everything that reads the bucket is
 * streamed (`listing`, then `panel`) so the page renders immediately with skeletons.
 */
export async function load({ parent, locals, params, url }) {
  const { project } = await parent();
  const scope = {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id ?? '',
  } satisfies StackScope;
  const refresh = url.searchParams.get('refresh') === '1';
  const base = `/org/${params.org}/projects/${params.slug}/state-iac`;
  const common = { base, organizationSettingsHref: `/org/${params.org}/settings/state-iac` };

  if (!(await canReadStacks(locals, scope))) throw error(403, 'Forbidden');
  const requested = url.searchParams.get('stack');
  const wanted = requested ? parseStackKey(requested) : null;
  if (requested) {
    // not assigned to this project: same answer as a missing one
    if (!wanted || !(await projectCoversStack(project.id, wanted))) {
      throw error(404, 'Stack not found');
    }
  }
  const [states, history, hasBindings] = await Promise.all([
    canReadStates(locals, scope),
    canReadHistory(locals, scope),
    projectCoversStack(project.id),
  ]);
  const flags = { canReadStates: states, canReadHistory: history };
  if (!hasBindings) {
    const listing: StackListing = { kind: 'empty' };
    const panel: StackPanel = { kind: 'none' };
    return {
      ...common,
      ...flags,
      listing: Promise.resolve(listing),
      panel: Promise.resolve(panel),
    };
  }

  type Chosen = {
    ref: { backendId: string; project: string; stack: string };
    key: string;
  };
  let chosen: Chosen | null = null;
  const listing = safe<StackListing>(
    async () => {
      const listed = await listStacks(locals, scope, { refresh });
      if (!listed.ok) return { kind: 'error', code: 'unknown' };
      const now = Date.now();
      const items = listed.data.backends.flatMap((group) =>
        group.stacks.map((stack) => ({ stack, backend: group.backend })),
      );
      if (items.length === 0) {
        const failed = listed.data.backends.find((group) => group.error);
        return failed?.error ? { kind: 'error', code: failed.error } : { kind: 'empty' };
      }
      const environments: EnvironmentView[] = items.map(({ stack, backend }) => ({
        key: stackKey(stack.ref),
        project: stack.ref.project,
        stack: stack.ref.stack,
        health: stackHealth(stack, backend.lastError, now),
        resourceCount: stack.resourceCount,
        lastUpdate: stack.lastUpdate
          ? {
              result: stack.lastUpdate.result,
              at: stack.lastUpdate.endedAt ?? stack.lastUpdate.startedAt,
            }
          : null,
        updatedAt: stack.updatedAt,
        error: stack.error,
      }));
      const recency = (item: (typeof items)[number]) =>
        Date.parse(item.stack.lastUpdate?.endedAt ?? item.stack.updatedAt ?? '') || 0;
      const found = wanted
        ? items.find(
            ({ stack }) =>
              stack.ref.backendId === wanted.backendId &&
              (stack.ref.project ?? '~') === wanted.project &&
              stack.ref.stack === wanted.stack,
          )
        : [...items].sort((a, b) => recency(b) - recency(a))[0];
      // assigned to the project but not (or no longer) in the bucket
      if (!found) return { kind: 'notfound' };
      chosen = {
        ref: {
          backendId: found.stack.ref.backendId,
          project: found.stack.ref.project ?? '~',
          stack: found.stack.ref.stack,
        },
        key: stackKey(found.stack.ref),
      };
      return {
        kind: 'ready',
        environments,
        selectedKey: chosen.key,
        backend: { ...found.backend, lastError: found.backend.lastError },
        locked: Boolean(found.stack.lock),
        warnings: environmentWarnings(
          items.map(({ stack }) => stack),
          {
            backendId: found.stack.ref.backendId,
            project: found.stack.ref.project,
            stack: found.stack.ref.stack,
          },
          now,
        ),
      };
    },
    { kind: 'error', code: 'unknown' },
  );

  const panel = listing.then((result) =>
    safe<StackPanel>(
      async () => {
        const target = chosen as Chosen | null;
        if (result.kind !== 'ready' || !target) return { kind: 'none' };
        const [detail, dashboard] = await Promise.all([
          // the listing above already refreshed the caches
          getStack(locals, scope, target.ref, states ? ['resources', 'outputs'] : []),
          getProjectDashboard(locals, scope, target.ref),
        ]);
        if (!detail.ok || !dashboard.ok) return { kind: 'error', code: 'unknown' };
        const part = encodeURIComponent;
        return {
          kind: 'ready',
          detail: detail.data,
          dashboard: dashboard.data,
          apiBase: `/api/state-iac/stacks/${part(target.ref.backendId)}/${part(target.ref.project)}/${part(target.ref.stack)}`,
          scopeQuery: `projectId=${part(project.id)}`,
        };
      },
      { kind: 'error', code: 'unknown' },
    ),
  );

  return { ...common, ...flags, listing, panel };
}
