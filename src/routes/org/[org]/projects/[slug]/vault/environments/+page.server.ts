import { error, fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectService } from '$modules/projects';
import { vaultService } from '$modules/vault';

export async function load({ parent, locals }) {
  const { project } = await parent();
  const canRead = await cancanService.canSessionUser(
    locals.user,
    'project:vault:environments:read',
    { scope: 'project', projectId: project.id, organizationId: project.organization?.id },
  );

  if (!canRead) throw error(403, 'Forbidden');

  return {
    environments: await vaultService.listEnvironments(project.id),
    canManageEnvironments: await cancanService.canSessionUser(
      locals.user,
      'project:vault:environments:update',
      { scope: 'project', projectId: project.id, organizationId: project.organization?.id },
    ),
    canDeleteEnvironments: await cancanService.canSessionUser(
      locals.user,
      'project:vault:environments:delete',
      { scope: 'project', projectId: project.id, organizationId: project.organization?.id },
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
  create: async ({ request, params, locals }) => {
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
  update: async ({ request, params, locals }) => {
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
  delete: async ({ request, params, locals }) => {
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
};
