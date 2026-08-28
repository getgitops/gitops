import { fail } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { organizationService } from '$modules/organization';
import { projectService } from '$modules/projects';

function errorResponse(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'Project action failed.' });
}

export async function load({ params }) {
  const organization = await organizationService.findBySlug(params.org);
  const projects = await projectService.listProjectsByOrganization(organization.id);
  return { organization, projects };
}

export const actions = {
  async createProject({ request, locals }) {
    try {
      const form = await request.formData();
      const organizationId = String(form.get('organizationId') ?? '');
      const canCreate = await cancanService.canSessionUser(
        locals.user,
        'organization:projects:create',
        {
          scope: 'organization',
          organizationId,
        },
      );

      if (!canCreate) return fail(403, { error: 'Forbidden' });

      const project = await projectService.createProject({
        organizationId,
        name: String(form.get('name') ?? ''),
        slug: String(form.get('slug') ?? '') || undefined,
        description: String(form.get('description') ?? '') || undefined,
        status: String(form.get('status') ?? ''),
      });

      return { success: true, project };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async deleteProject({ request, locals }) {
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
      return { success: true };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },
};
