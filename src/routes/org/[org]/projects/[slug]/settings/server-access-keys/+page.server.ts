import { error, fail } from '@sveltejs/kit';
import type { PermissionGrant } from '$lib/permissions';
import { apiKeysService, cancanService, roleService } from '$modules/auth';
import { projectService } from '$modules/projects';

async function authorize(
  user: Parameters<typeof cancanService.canSessionUser>[0],
  projectSlug: string,
  permission: PermissionGrant,
) {
  const project = await projectService.getProjectBySlug(projectSlug);
  const allowed = await cancanService.canSessionUser(user, permission, {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });
  return { project, allowed };
}

function expiresAtFromDays(expiresInDays: string): string | null {
  const days = Number(expiresInDays);
  if (!expiresInDays || !Number.isFinite(days) || days <= 0) {
    return null;
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function errorResponse(err: unknown) {
  return fail(400, { error: err instanceof Error ? err.message : 'Server key action failed.' });
}

export async function load({ parent, locals }) {
  const { project } = await parent();

  const canRead = await cancanService.canSessionUser(locals.user, 'project:server-keys:read', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });

  if (!canRead) {
    throw error(403, 'Forbidden');
  }

  const [apiKeys, roles, canCreate, canUpdate, canDelete] = await Promise.all([
    apiKeysService.listActiveApiKeysByProject(project.id),
    roleService.listRoles('project', project.id),
    cancanService.canSessionUser(locals.user, 'project:server-keys:create', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    }),
    cancanService.canSessionUser(locals.user, 'project:server-keys:update', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    }),
    cancanService.canSessionUser(locals.user, 'project:server-keys:delete', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    }),
  ]);

  return {
    apiKeys,
    roles: roles.map((role) => ({ id: role.id, name: role.name, slug: role.slug })),
    canCreate,
    canUpdate,
    canDelete,
  };
}

export const actions = {
  create: async ({ request, params, locals }) => {
    const { project, allowed } = await authorize(
      locals.user,
      params.slug,
      'project:server-keys:create',
    );
    if (!allowed) return fail(403, { error: 'Forbidden' });

    const formData = await request.formData();

    try {
      const { token } = await apiKeysService.createProjectApiKey({
        projectId: project.id,
        roleId: String(formData.get('roleId') || ''),
        name: String(formData.get('name') || ''),
        expiresAt: expiresAtFromDays(String(formData.get('expiresInDays') || '').trim()),
        createdByUserId: locals.user!.id,
      });

      return { success: true, createdKey: token };
    } catch (err) {
      return errorResponse(err);
    }
  },

  rotate: async ({ request, params, locals }) => {
    const { project, allowed } = await authorize(
      locals.user,
      params.slug,
      'project:server-keys:update',
    );
    if (!allowed) return fail(403, { error: 'Forbidden' });

    const formData = await request.formData();

    try {
      const { token } = await apiKeysService.regenerateProjectApiKey(
        project.id,
        String(formData.get('keyId') || ''),
      );
      return { success: true, createdKey: token };
    } catch (err) {
      return errorResponse(err);
    }
  },

  revoke: async ({ request, params, locals }) => {
    const { project, allowed } = await authorize(
      locals.user,
      params.slug,
      'project:server-keys:delete',
    );
    if (!allowed) return fail(403, { error: 'Forbidden' });

    const formData = await request.formData();

    try {
      await apiKeysService.revokeProjectApiKey(project.id, String(formData.get('keyId') || ''));
      return { success: true };
    } catch (err) {
      return errorResponse(err);
    }
  },
};
