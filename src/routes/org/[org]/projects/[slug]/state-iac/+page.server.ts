import { error } from '@sveltejs/kit';
import { environmentWarnings, stackHealth } from '#modules/state-iac';
import {
  canReadHistory,
  canReadStates,
  getProjectDashboard,
  getStack,
  listStacks,
  type StackScope,
} from '#lib/server/state-iac/stacks';
import { parseStackKey, stackKey, type EnvironmentView } from '#lib/state-iac/types';

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

  // only the stacks assigned to this project (`project:stateiac:stacks:read`)
  const listed = await listStacks(locals, scope, { refresh });
  if (!listed.ok) throw error(listed.status, listed.error);
  const now = Date.now();
  const items = listed.data.backends.flatMap((group) =>
    group.stacks.map((stack) => ({ stack, backend: group.backend })),
  );
  if (items.length === 0) return { ...common, empty: true as const };

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

  // `?stack=<backend>/<project>/<stack>`; by default the most recently updated one
  const requested = url.searchParams.get('stack');
  const recency = (item: (typeof items)[number]) =>
    Date.parse(item.stack.lastUpdate?.endedAt ?? item.stack.updatedAt ?? '') || 0;
  let chosen = [...items].sort((a, b) => recency(b) - recency(a))[0];
  if (requested) {
    const wanted = parseStackKey(requested);
    const found = wanted
      ? items.find(
          ({ stack }) =>
            stack.ref.backendId === wanted.backendId &&
            (stack.ref.project ?? '~') === wanted.project &&
            stack.ref.stack === wanted.stack,
        )
      : undefined;
    // not assigned to this project: same answer as a missing one
    if (!found) throw error(404, 'Stack not found');
    chosen = found;
  }
  const ref = {
    backendId: chosen.stack.ref.backendId,
    project: chosen.stack.ref.project ?? '~',
    stack: chosen.stack.ref.stack,
  };
  const [states, history] = await Promise.all([
    canReadStates(locals, scope),
    canReadHistory(locals, scope),
  ]);
  const [detail, dashboard] = await Promise.all([
    getStack(locals, scope, ref, states ? ['resources', 'outputs'] : [], { refresh }),
    getProjectDashboard(locals, scope, ref, { refresh }),
  ]);
  if (!detail.ok) throw error(detail.status, detail.error);
  if (!dashboard.ok) throw error(dashboard.status, dashboard.error);

  const part = encodeURIComponent;
  return {
    ...common,
    empty: false as const,
    environments,
    selectedKey: stackKey(chosen.stack.ref),
    backend: { ...detail.data.backend, lastError: chosen.backend.lastError },
    detail: detail.data,
    dashboard: dashboard.data,
    warnings: environmentWarnings(
      items.map(({ stack }) => stack),
      {
        backendId: chosen.stack.ref.backendId,
        project: chosen.stack.ref.project,
        stack: chosen.stack.ref.stack,
      },
      now,
    ),
    canReadStates: states,
    canReadHistory: history,
    apiBase: `/api/state-iac/stacks/${part(ref.backendId)}/${part(ref.project)}/${part(ref.stack)}`,
    scopeQuery: `projectId=${part(project.id)}`,
  };
}
