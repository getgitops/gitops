import { error } from '@sveltejs/kit';
import { projectService } from '#modules/projects';
import { getStack } from '#lib/server/state-iac/stacks';

export async function load({ parent, locals, params, url }) {
  const { organization } = await parent();
  const result = await getStack(
    locals,
    { scope: 'organization', organizationId: organization.id },
    { backendId: params.backend, project: params.pulumiProject, stack: params.stack },
    ['resources', 'outputs'],
    { refresh: url.searchParams.get('refresh') === '1' },
  );
  if (!result.ok) throw error(result.status, result.error);
  const assigned = result.data.summary.assignedProjectId;
  const project = assigned ? await projectService.getProject(assigned).catch(() => null) : null;
  return {
    detail: result.data,
    projectName: project?.name ?? null,
    backHref: `/org/${params.org}/state-iac`,
  };
}
