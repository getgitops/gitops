import { fail } from '@sveltejs/kit';
import { cancanService, roleService } from '$modules/auth';
import { projectService } from '$modules/projects';

function parsePermissions(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const permissions = JSON.parse(value) as unknown;
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((permission): permission is string => typeof permission === 'string');
}

function errorResponse(errorValue: unknown) {
  return fail(400, {
    error: errorValue instanceof Error ? errorValue.message : 'Role action failed.',
  });
}

async function canManageProjectRole(
  user: Parameters<typeof cancanService.canSessionUser>[0],
  projectSlug: string,
  permission: 'project:roles:create' | 'project:roles:update' | 'project:roles:delete',
) {
  const project = await projectService.getProjectBySlug(projectSlug);
  const allowed = await cancanService.canSessionUser(user, permission, {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });
  return { project, allowed };
}

export async function load({ parent, locals }) {
  const { project } = await parent();
  const canCreate = await cancanService.canSessionUser(locals.user, 'project:roles:create', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });
  return { project, canCreate };
}

export const actions = {
  async createRole({ request, locals, params }) {
    const { project, allowed } = await canManageProjectRole(
      locals.user,
      params.slug,
      'project:roles:create',
    );
    if (!allowed) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      const role = await roleService.createRole({
        name: String(form.get('name') ?? ''),
        slug: String(form.get('slug') ?? ''),
        permissions: parsePermissions(form.get('permissions')),
        scope: 'project',
        projectId: project.id,
      });
      return { success: true, role };
    } catch (errorValue: unknown) {
      return errorResponse(errorValue);
    }
  },
};
