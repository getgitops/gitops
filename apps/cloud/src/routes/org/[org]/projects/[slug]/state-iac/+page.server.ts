import { error } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectService } from '$modules/projects';

export async function load({ params, locals }) {
  let project;
  try {
    project = await projectService.getProjectBySlug(params.slug);
  } catch {
    throw error(404, 'Project not found');
  }

  const organizationId = project.organization?.id;
  const [canReadStacks, canReadStates, canReadHistory] = await Promise.all([
    cancanService.canSessionUser(locals.user, 'project:stateiac:stacks:read', {
      scope: 'project',
      projectId: project.id,
      organizationId,
    }),
    cancanService.canSessionUser(locals.user, 'project:stateiac:states:read', {
      scope: 'project',
      projectId: project.id,
      organizationId,
    }),
    cancanService.canSessionUser(locals.user, 'project:stateiac:history:read', {
      scope: 'project',
      projectId: project.id,
      organizationId,
    }),
  ]);

  if (!canReadStacks && !canReadStates && !canReadHistory) {
    throw error(403, 'Forbidden');
  }

  return {};
}
