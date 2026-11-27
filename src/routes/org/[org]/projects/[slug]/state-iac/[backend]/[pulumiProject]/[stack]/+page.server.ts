import { error, redirect } from '@sveltejs/kit';
import { canReadStacks, projectCoversStack, type StackScope } from '#lib/server/state-iac/stacks';

/** Old link to a stack: the dashboard now lives at `…/state-iac?stack=…` (decided from bindings). */
export async function load({ parent, locals, params }) {
  const { project } = await parent();
  const scope: StackScope = {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id ?? '',
  };
  // a stack that is not assigned to this project is indistinguishable from a missing one
  const visible =
    (await canReadStacks(locals, scope)) &&
    (await projectCoversStack(project.id, {
      backendId: params.backend,
      project: params.pulumiProject,
      stack: params.stack,
    }));
  if (!visible) throw error(404, 'Stack not found');
  const part = encodeURIComponent;
  const query = new URLSearchParams({
    stack: `${part(params.backend)}/${part(params.pulumiProject)}/${part(params.stack)}`,
  });
  throw redirect(303, `/org/${params.org}/projects/${params.slug}/state-iac?${query}`);
}
