import { error, redirect } from '@sveltejs/kit';
import { getStack, type StackScope } from '#lib/server/state-iac/stacks';
import { stackKey } from '#lib/state-iac/types';

/** Old link to a stack: the dashboard now lives at `…/state-iac?stack=…`. */
export async function load({ parent, locals, params }) {
  const { project } = await parent();
  const scope: StackScope = {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id ?? '',
  };
  const result = await getStack(
    locals,
    scope,
    { backendId: params.backend, project: params.pulumiProject, stack: params.stack },
    [],
  );
  // a stack that is not assigned to this project is indistinguishable from a missing one
  if (!result.ok) throw error(result.status, result.error);
  const query = new URLSearchParams({ stack: stackKey(result.data.summary.ref) });
  throw redirect(303, `/org/${params.org}/projects/${params.slug}/state-iac?${query}`);
}
