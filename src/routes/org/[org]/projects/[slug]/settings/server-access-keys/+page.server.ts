import { error, fail } from '@sveltejs/kit';
import { apiKeysService, cancanService } from '../../../../../../../modules/auth';
import { projectService } from '../../../../../../../modules/projects';

export async function load({ parent, locals }) {
  const { project } = await parent();

  const canRead = await cancanService.canSessionUser(locals.user, 'openreport:read', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });

  if (!canRead) {
    throw error(403, 'Forbidden');
  }

  const apiKeys = await apiKeysService.listActiveApiKeysByProject(project.id);

  return { apiKeys };
}

export const actions = {
  create: async ({ request, params, locals }) => {
    const project = await projectService.getProjectBySlug(params.slug);

    const canCreate = await cancanService.canSessionUser(locals.user, 'openreport:create', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    });

    if (!canCreate) {
      return fail(403, { error: 'Forbidden' });
    }

    const formData = await request.formData();
    const name = String(formData.get('name') || '').trim();
    const expiresInDays = String(formData.get('expiresInDays') || '').trim();

    if (!name) {
      return fail(400, { error: 'Key name is required.' });
    }

    const expiresAt = expiresInDays
      ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { token } = await apiKeysService.createProjectApiKey(
      locals.user!.id,
      project.id,
      name,
      expiresAt,
    );

    return { success: true, createdKey: token };
  },

  revoke: async ({ request, params, locals }) => {
    const project = await projectService.getProjectBySlug(params.slug);

    const canDelete = await cancanService.canSessionUser(locals.user, 'openreport:delete', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    });

    if (!canDelete) {
      return fail(403, { error: 'Forbidden' });
    }

    const formData = await request.formData();
    const keyId = String(formData.get('keyId') || '');

    try {
      await apiKeysService.revokeProjectApiKey(project.id, keyId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke key';
      return fail(400, { error: message });
    }

    return { success: true };
  },
};
