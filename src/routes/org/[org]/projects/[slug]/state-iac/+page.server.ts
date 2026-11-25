import { error } from '@sveltejs/kit';
import { listStacks, type StackScope } from '#lib/server/state-iac/stacks';

export async function load({ parent, locals, params, url }) {
  const { project } = await parent();
  const scope: StackScope = {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id ?? '',
  };
  // only the stacks assigned to this project (`project:stateiac:stacks:read`)
  const result = await listStacks(locals, scope, {
    refresh: url.searchParams.get('refresh') === '1',
  });
  if (!result.ok) throw error(result.status, result.error);
  return {
    groups: result.data.backends,
    base: `/org/${params.org}/projects/${params.slug}/state-iac`,
    organizationSettingsHref: `/org/${params.org}/settings/state-iac`,
  };
}
