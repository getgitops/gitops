import { error } from '@sveltejs/kit';
import { projectService } from '../../../../../modules/projects';
import { cancanService } from '../../../../../modules/auth';

export async function load({ params, locals }) {
  try {
    const project = await projectService.getProjectBySlug(params.slug);
    const organizationId = project.organization?.id;
    const canRead = await cancanService.canSessionUser(locals.user, 'stateiac:read', {
      scope: 'project',
      projectId: project.id,
      organizationId,
    });

    if (!canRead) {
      throw error(403, 'Forbidden');
    }

    const [canCreateVault, canCreateOpenReport, canCreateStateIac] = await Promise.all([
      cancanService.canSessionUser(locals.user, 'vault:create', {
        scope: 'project',
        projectId: project.id,
        organizationId,
      }),
      cancanService.canSessionUser(locals.user, 'openreport:create', {
        scope: 'project',
        projectId: project.id,
        organizationId,
      }),
      cancanService.canSessionUser(locals.user, 'stateiac:create', {
        scope: 'project',
        projectId: project.id,
        organizationId,
      }),
    ]);

    return { project, canCreateVault, canCreateOpenReport, canCreateStateIac };
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && err.status === 403) throw err;
    throw error(404, 'Project not found');
  }
}
