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
  const [canReadSecrets, canReadEnvironments] = await Promise.all([
    cancanService.canSessionUser(locals.user, 'project:vault:secrets:read', {
      scope: 'project',
      projectId: project.id,
      organizationId,
    }),
    cancanService.canSessionUser(locals.user, 'project:vault:environments:read', {
      scope: 'project',
      projectId: project.id,
      organizationId,
    }),
  ]);

  if (!canReadSecrets && !canReadEnvironments) {
    throw error(403, 'Forbidden');
  }

  return {};
}
