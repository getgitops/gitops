import { error, redirect } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectService } from '$modules/projects';
import { vaultService } from '$modules/vault';

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

  const environments = await vaultService.listEnvironments(project.id);
  throw redirect(
    302,
    `/org/${params.org}/projects/${params.slug}/vault/${environments[0]?.slug ?? 'dev'}`,
  );
}
