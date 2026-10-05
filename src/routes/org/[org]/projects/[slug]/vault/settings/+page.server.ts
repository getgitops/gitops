import { error, fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectService } from '$modules/projects';
import { vaultService, VAULT_ENCRYPTION_PROVIDERS } from '$modules/vault';

export async function load({ parent, locals }) {
  const { project } = await parent();
  const organizationId = project.organization?.id;

  const [canReadSettings, canReadEnvironments] = await Promise.all([
    cancanService.canSessionUser(locals.user, 'project:vault:settings:read', {
      scope: 'project',
      projectId: project.id,
      organizationId,
    }),
    cancanService.canSessionUser(locals.user, 'project:vault:environments:read', {
      scope: 'project',
      projectId: project.id,
      organizationId,
    }),
  ]);

  if (!canReadSettings && !canReadEnvironments) throw error(403, 'Forbidden');

  return {
    settings: await vaultService.getSettings(project.id),
    encryptionProviders: VAULT_ENCRYPTION_PROVIDERS,
    canManageSettings: await cancanService.canSessionUser(
      locals.user,
      'project:vault:settings:update',
      { scope: 'project', projectId: project.id, organizationId },
    ),
    environments: await vaultService.listEnvironments(project.id),
    canManageEnvironments: await cancanService.canSessionUser(
      locals.user,
      'project:vault:environments:update',
      { scope: 'project', projectId: project.id, organizationId },
    ),
    canDeleteEnvironments: await cancanService.canSessionUser(
      locals.user,
      'project:vault:environments:delete',
      { scope: 'project', projectId: project.id, organizationId },
    ),
  };
}

async function getAuthorizedProject(
  params: { slug: string },
  locals: RequestEvent['locals'],
  permission: string,
) {
  const project = await projectService.getProjectBySlug(params.slug);
  const allowed = await cancanService.canSessionUser(locals.user, permission, {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });
  if (!allowed) throw new Error('Forbidden');
  return project;
}

export const actions = {
  updateSettings: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(params, locals, 'project:vault:settings:update');
      const formData = await request.formData();
      await vaultService.updateSettings(project.id, {
        capitalizeSecrets: formData.get('capitalizeSecrets') === 'on',
        encryptionProvider: String(
          formData.get('encryptionProvider') || 'gitops_kms',
        ) as 'gitops_kms',
      });
      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudo actualizar la configuracion',
      });
    }
  },
  createEnvironment: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(
        params,
        locals,
        'project:vault:environments:create',
      );
      const formData = await request.formData();
      await vaultService.createEnvironment(project.id, {
        name: String(formData.get('name') || ''),
        slug: String(formData.get('slug') || ''),
        description: String(formData.get('description') || ''),
      });
      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudo crear el entorno',
      });
    }
  },
  updateEnvironment: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(
        params,
        locals,
        'project:vault:environments:update',
      );
      const formData = await request.formData();
      await vaultService.updateEnvironment(project.id, String(formData.get('id') || ''), {
        name: String(formData.get('name') || ''),
        slug: String(formData.get('slug') || ''),
        description: String(formData.get('description') || ''),
      });
      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudo actualizar el entorno',
      });
    }
  },
  deleteEnvironment: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(
        params,
        locals,
        'project:vault:environments:delete',
      );
      const formData = await request.formData();
      await vaultService.deleteEnvironment(project.id, String(formData.get('id') || ''));
      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudo borrar el entorno',
      });
    }
  },
  moveEnvironment: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(
        params,
        locals,
        'project:vault:environments:update',
      );
      const formData = await request.formData();
      const direction = String(formData.get('direction') || '') === 'up' ? 'up' : 'down';
      await vaultService.moveEnvironment(project.id, String(formData.get('id') || ''), direction);
      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudo reordenar el entorno',
      });
    }
  },
};

