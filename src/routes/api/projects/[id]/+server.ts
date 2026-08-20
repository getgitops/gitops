import { json } from '@sveltejs/kit';
import { projectService } from '../../../../modules/projects';
import { can } from '../../../../modules/auth';

export async function GET({ params, locals }) {
  if (!can(locals.user, 'stateiac:read')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const project = await projectService.getProject(params.id);
    return json({ project });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 404 });
  }
}

export async function PATCH({ request, params, locals }) {
  if (!can(locals.user, 'stateiac:update')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = (await request.json()) as {
      name?: string;
      slug?: string;
      description?: string;
      status?: string;
      modules?: { vault?: boolean; openreport?: boolean; stateiac?: boolean };
    };

    const project = await projectService.updateProject(params.id, {
      name: data.name,
      slug: data.slug,
      description: data.description,
      status: data.status,
      modules: data.modules,
    });

    return json({ success: true, project });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}

export async function DELETE({ params, locals }) {
  if (!can(locals.user, 'stateiac:delete')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await projectService.deleteProject(params.id);
    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
