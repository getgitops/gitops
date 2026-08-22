import { json } from '@sveltejs/kit';
import { projectService } from '../../../../modules/projects';
import { cancanService } from '../../../../modules/auth';

export async function GET({ params, locals }) {
  try {
    const project = await projectService.getProject(params.id);
    if (
      !(await cancanService.canSessionUser(locals.user, 'stateiac:read', {
        scope: 'project',
        projectId: project.id,
        organizationId: project.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    return json({ project });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 404 });
  }
}

export async function PATCH({ request, params, locals }) {
  try {
    const currentProject = await projectService.getProject(params.id);
    if (
      !(await cancanService.canSessionUser(locals.user, 'stateiac:update', {
        scope: 'project',
        projectId: currentProject.id,
        organizationId: currentProject.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = (await request.json()) as {
      organizationId?: string;
      name?: string;
      slug?: string;
      description?: string;
      status?: string;
      modules?: { vault?: boolean; openreport?: boolean; stateiac?: boolean };
    };

    const project = await projectService.updateProject(params.id, {
      organizationId: data.organizationId,
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
  try {
    const project = await projectService.getProject(params.id);
    if (
      !(await cancanService.canSessionUser(locals.user, 'stateiac:delete', {
        scope: 'project',
        projectId: project.id,
        organizationId: project.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    await projectService.deleteProject(params.id);
    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
