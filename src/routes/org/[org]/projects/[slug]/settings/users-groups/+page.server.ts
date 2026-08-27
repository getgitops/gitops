import { fail } from '@sveltejs/kit';
import { cancanService, roleService, userAccessService } from '$modules/auth';
import { projectService } from '$modules/projects';

function errorResponse(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'User action failed.' });
}

async function canUpdateProjectUsers(user: App.Locals['user'], projectSlug: string) {
  const project = await projectService.getProjectBySlug(projectSlug);
  const allowed = await cancanService.canSessionUser(user, 'stateiac:update', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });
  return { project, allowed };
}

export async function load({ parent }) {
  const { project } = await parent();
  const [users, roles, assignableUsers] = await Promise.all([
    userAccessService.listUsers('project', project.id),
    roleService.listRoles('project', project.id),
    userAccessService.listAssignableUsers(),
  ]);
  return { project, users, roles, assignableUsers };
}

export const actions = {
  async addUser({ request, locals, params }) {
    const { project, allowed } = await canUpdateProjectUsers(locals.user, params.slug);
    if (!allowed) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      const user = await userAccessService.assignProjectUser({
        projectId: project.id,
        userId: String(form.get('userId') ?? ''),
        roleId: String(form.get('roleId') ?? ''),
      });
      return { success: true, user };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async updateUserAccess({ request, locals, params }) {
    const { project, allowed } = await canUpdateProjectUsers(locals.user, params.slug);
    if (!allowed) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      const user = await userAccessService.updateAccess({
        accessId: String(form.get('accessId') ?? ''),
        scope: 'project',
        scopeId: project.id,
        roleId: String(form.get('roleId') ?? ''),
        status: String(form.get('status') ?? ''),
      });
      return { success: true, user };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async removeUserAccess({ request, locals, params }) {
    const { project, allowed } = await canUpdateProjectUsers(locals.user, params.slug);
    if (!allowed) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      await userAccessService.removeAccess({
        accessId: String(form.get('accessId') ?? ''),
        scope: 'project',
        scopeId: project.id,
      });
      return { success: true };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },

  async resendInvitation({ request, locals, params }) {
    const { project, allowed } = await canUpdateProjectUsers(locals.user, params.slug);
    if (!allowed) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      const user = await userAccessService.resendInvitation({
        accessId: String(form.get('accessId') ?? ''),
        scope: 'project',
        scopeId: project.id,
      });
      return { success: true, user };
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },
};
