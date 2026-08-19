import { json } from '@sveltejs/kit';
import { projectService } from '../../../modules/projects';
import { can } from '../../../modules/auth';

export async function GET({ locals }) {
  if (!can(locals.user, 'stateiac:read')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const projects = projectService.listProjects();
    return json({ projects });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

export async function POST({ request, locals }) {
  if (!can(locals.user, 'stateiac:create')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { name } = await request.json();
    const project = projectService.createProject(String(name || ''));
    return json({ success: true, project });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
