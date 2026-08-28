import { error, fail, redirect } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectService } from '$modules/projects';

function errorResponse(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'Project action failed.' });
}

export async function load({ params, locals }) {
  let project;
  try {
    project = await projectService.getProjectBySlug(params.slug);
  } catch {
    throw error(404, 'Project not found');
  }

  const canRead = await cancanService.canManageProject(
    locals.user,
    project.id,
    project.organization?.id,
  );

  if (!canRead) throw error(403, 'Forbidden');

  const canDelete = await cancanService.canSessionUser(locals.user, 'project:project:delete', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });

  return { project, canDelete };
}

export const actions = {
  async updateProject({ request, params, locals }) {
    let project;
    try {
      const form = await request.formData();
      const id = String(form.get('id') ?? '');
      const currentProject = await projectService.getProject(id);
      const canUpdate = await cancanService.canSessionUser(locals.user, 'project:project:update', {
        scope: 'project',
        projectId: currentProject.id,
        organizationId: currentProject.organization?.id,
      });

      if (!canUpdate) return fail(403, { error: 'Forbidden' });

      project = await projectService.updateProject(id, {
        name: String(form.get('name') ?? ''),
        slug: String(form.get('slug') ?? ''),
        description: String(form.get('description') ?? ''),
        modules: {
          vault: form.get('moduleVault') === 'on',
          codereport: form.get('moduleCodeReport') === 'on',
          stateiac: form.get('moduleStateIac') === 'on',
        },
      });
    } catch (error: unknown) {
      return errorResponse(error);
    }

    if (project.slug !== params.slug) {
      throw redirect(303, `/org/${params.org}/projects/${project.slug}/settings/overview`);
    }

    return { success: true, project };
  },

  async updateProjectStatus({ request, locals }) {
    try {
      const form = await request.formData();
      const id = String(form.get('id') ?? '');
      const currentProject = await projectService.getProject(id);
      const canUpdate = await cancanService.canSessionUser(locals.user, 'project:project:update', {
        scope: 'project',
        projectId: currentProject.id,
        organizationId: currentProject.organization?.id,
      });

      if (!canUpdate) return fail(403, { error: 'Forbidden' });

      const project = await projectService.updateProject(id, {
        status: String(form.get('status') ?? ''),
      });

      return { success: true, project };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async deleteProject({ request, params, locals }) {
    try {
      const form = await request.formData();
      const id = String(form.get('id') ?? '');
      const project = await projectService.getProject(id);
      const canDelete = await cancanService.canSessionUser(locals.user, 'project:project:delete', {
        scope: 'project',
        projectId: project.id,
        organizationId: project.organization?.id,
      });

      if (!canDelete) return fail(403, { error: 'Forbidden' });

      await projectService.deleteProject(id);
    } catch (error: unknown) {
      return errorResponse(error);
    }

    throw redirect(303, `/org/${params.org}/settings/projects`);
  },
};
