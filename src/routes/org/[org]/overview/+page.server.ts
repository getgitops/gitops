import { error } from '@sveltejs/kit';
import { projectService } from '../../../../modules/projects';
import { can } from '../../../../modules/auth';

export async function load({ locals }) {
  if (!can(locals.user, 'stateiac:read')) {
    throw error(403, 'Forbidden');
  }

  const projects = await projectService.listProjects();
  const activeProjects = projects.filter((project) => project.status === 'active');

  return { projects: activeProjects };
}
