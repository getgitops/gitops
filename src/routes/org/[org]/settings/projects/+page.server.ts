import { error, fail } from '@sveltejs/kit';
import { cancanService, roleService } from '$modules/auth';
import { organizationService } from '$modules/organization';
import { projectService } from '$modules/projects';

function errorResponse(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'Project action failed.' });
}

export async function load({ params, locals }) {
  const organization = await organizationService.findBySlug(params.org);

  if (
    !(await cancanService.canSessionUser(locals.user, 'organization:projects:read', {
      scope: 'organization',
      organizationId: organization.id,
    }))
  ) {
    throw error(403, 'Forbidden');
  }

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
      await roleService.createDefaultProjectRoles(project.id);

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
      const canDelete = await cancanService.canSessionUser(
        locals.user,
        'organization:projects:delete',
        {
          scope: 'organization',
          organizationId: project.organization?.id ?? '',
        },
      );

      if (!canDelete) return fail(403, { error: 'Forbidden' });

      await projectService.deleteProject(id);
      return { success: true };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },
};
