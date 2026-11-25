import { error } from '@sveltejs/kit';
import {
  canReadHistory,
  canReadStates,
  getStack,
  type StackScope,
} from '#lib/server/state-iac/stacks';

export async function load({ parent, locals, params, url }) {
  const { project } = await parent();
  const scope: StackScope = {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id ?? '',
  };
  // resources and outputs need `project:stateiac:states:read`; the summary only `stacks:read`
  const [states, history] = await Promise.all([
    canReadStates(locals, scope),
    canReadHistory(locals, scope),
  ]);
  const result = await getStack(
    locals,
    scope,
    { backendId: params.backend, project: params.pulumiProject, stack: params.stack },
    states ? ['resources', 'outputs'] : [],
    { refresh: url.searchParams.get('refresh') === '1' },
  );
  // a stack that is not assigned to this project is indistinguishable from a missing one
  if (!result.ok) throw error(result.status, result.error);
  return {
    detail: result.data,
    canReadStates: states,
    canReadHistory: history,
    apiBase: apiBaseOf(params),
    scopeQuery: `projectId=${encodeURIComponent(project.id)}`,
    backHref: `/org/${params.org}/projects/${params.slug}/state-iac`,
  };
}

function apiBaseOf(params: { backend: string; pulumiProject: string; stack: string }) {
  const part = encodeURIComponent;
  return `/api/state-iac/stacks/${part(params.backend)}/${part(params.pulumiProject)}/${part(params.stack)}`;
}
