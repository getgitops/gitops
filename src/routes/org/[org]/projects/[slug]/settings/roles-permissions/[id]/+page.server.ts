import { error, fail } from '@sveltejs/kit';
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

export async function load({ parent, params, locals }) {
  const { project } = await parent();
  const [roles, canUpdate, canDelete] = await Promise.all([
    roleService.listRoles('project', project.id),
    cancanService.canSessionUser(locals.user, 'project:roles:update', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    }),
    cancanService.canSessionUser(locals.user, 'project:roles:delete', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    }),
  ]);
  const role = roles.find((row) => row.id === params.id);
  if (!role) throw error(404, 'Role not found');
  return { project, role, canUpdate, canDelete };
}

export const actions = {
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
    } catch (errorValue: unknown) {
      return errorResponse(errorValue);
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
    } catch (errorValue: unknown) {
      return errorResponse(errorValue);
    }
  },
};
