import { error } from '@sveltejs/kit';
import { projectService } from '../../../modules/projects';
import { can } from '../../../modules/auth';

export async function load({ params, locals }) {
  if (!can(locals.user, 'stateiac:read')) {
    throw error(403, 'Forbidden');
  }

  try {
    const project = await projectService.getProjectBySlug(params.slug);
    return { project };
  } catch {
    throw error(404, 'Project not found');
  }
}
