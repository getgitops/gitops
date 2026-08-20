import { json } from '@sveltejs/kit';
import { projectService } from '../../../modules/projects';
import { can } from '../../../modules/auth';

export async function GET({ locals }) {
  if (!can(locals.user, 'stateiac:read')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const projects = await projectService.listProjects();
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
    const data = (await request.json()) as {
      name?: string;
      slug?: string;
      description?: string;
      status?: string;
    };

    const project = await projectService.createProject({
      name: String(data.name || ''),
      slug: data.slug ? String(data.slug) : undefined,
      description: data.description ? String(data.description) : undefined,
      status: data.status ? String(data.status) : undefined,
    });

    return json({ success: true, project });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
