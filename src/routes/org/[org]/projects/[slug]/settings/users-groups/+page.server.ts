import { fail } from '@sveltejs/kit';
import { can, roleService, userAccessService } from '../../../../../../../modules/auth';
import { projectService } from '../../../../../../../modules/projects';

function errorResponse(error: unknown) {
  return fail(400, { error: error instanceof Error ? error.message : 'User action failed.' });
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
    if (!can(locals.user, 'stateiac:update')) return fail(403, { error: 'Forbidden' });

    try {
      const form = await request.formData();
      const project = await projectService.getProjectBySlug(params.slug);
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
};
