import { fail } from '@sveltejs/kit';
import { cancanService, roleService } from '$modules/auth';
import { projectService } from '$modules/projects';

function parsePermissions(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const permissions = JSON.parse(value) as unknown;
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((permission): permission is string => typeof permission === 'string');
}

function errorResponse(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'Role action failed.' });
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

export async function load({ parent }) {
  const { project } = await parent();
  const roles = await roleService.listRoles('project', project.id);
  return { roles };
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
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async updateRole({ request, locals, params }) {
    const { allowed } = await canManageProjectRole(
      locals.user,
      params.slug,
      'project:roles:update',
    );
    if (!allowed) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      const role = await roleService.updateRole(String(form.get('id') ?? ''), {
        name: String(form.get('name') ?? ''),
        permissions: parsePermissions(form.get('permissions')),
      });
      return { success: true, role };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async deleteRole({ request, locals, params }) {
    const { allowed } = await canManageProjectRole(
      locals.user,
      params.slug,
      'project:roles:delete',
    );
    if (!allowed) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      await roleService.deleteRole(String(form.get('id') ?? ''));
      return { success: true };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },
};
