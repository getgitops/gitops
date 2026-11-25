import { error } from '@sveltejs/kit';
import { canReadStates, getStack, type StackScope } from '#lib/server/state-iac/stacks';

export async function load({ parent, locals, params, url }) {
  const { project } = await parent();
  const scope: StackScope = {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id ?? '',
  };
  // resources and outputs need `project:stateiac:states:read`; the summary only `stacks:read`
  const states = await canReadStates(locals, scope);
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
    backHref: `/org/${params.org}/projects/${params.slug}/state-iac`,
  };
}
