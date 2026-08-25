import { error } from '@sveltejs/kit';
import { projectService } from '../../../../modules/projects';
import { cancanService } from '../../../../modules/auth';

export async function load({ locals, parent }) {
  const { organization } = await parent();

  if (
    !(await cancanService.canSessionUser(locals.user, 'stateiac:read', {
      scope: 'organization',
      organizationId: organization.id,
    }))
  ) {
    throw error(403, 'Forbidden');
  }

  const projects = await projectService.listProjectsByOrganization(organization.id);
  const activeProjects = projects.filter((project) => project.status === 'active');

  return { projects: activeProjects };
}
