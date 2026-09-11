import { error, fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectService } from '$modules/projects';
import { vaultService } from '$modules/vault';

export async function load({ params, locals }) {
  let project;
  try {
    project = await projectService.getProjectBySlug(params.slug);
  } catch {
    throw error(404, 'Project not found');
  }

  const organizationId = project.organization?.id;
  const [canReadSecrets, canReadEnvironments] = await Promise.all([
    cancanService.canSessionUser(locals.user, 'project:vault:secrets:read', {
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

  if (!canReadSecrets && !canReadEnvironments) {
    throw error(403, 'Forbidden');
  }

  const vault = await vaultService.getProjectVault(project.id);
  const settings = await vaultService.getSettings(project.id);
  const currentEnvironment = vault.environments.find(
    (environment) => environment.slug === params.env,
  );
  if (!currentEnvironment) {
    throw redirect(
      302,
      `/org/${params.org}/projects/${params.slug}/vault/${vault.environments[0]?.slug ?? 'dev'}`,
    );
  }

  const currentPath = routePath(params.path);
  let currentFolder;
  try {
    currentFolder = await vaultService.getFolderByPath(project.id, currentPath);
  } catch {
    throw error(404, 'Folder not found');
  }

  return {
    ...vault,
    currentEnvironment,
    currentFolder,
    currentPath,
    canManageSecrets: await cancanService.canSessionUser(
      locals.user,
      'project:vault:secrets:update',
      {
        scope: 'project',
        projectId: project.id,
        organizationId,
      },
    ),
    canDeleteSecrets: await cancanService.canSessionUser(
      locals.user,
      'project:vault:secrets:delete',
      {
        scope: 'project',
        projectId: project.id,
        organizationId,
      },
    ),
    capitalizeSecrets: settings.capitalizeSecrets,
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

function routePath(path: string | undefined) {
  if (!path) return '/';
  return `/${path
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .join('/')}`;
}

function normalizeFolderPath(path: string) {
  const segments = path.trim().split('/').filter(Boolean);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

function secretValuesFromForm(formData: FormData) {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('value:')) values[key.slice(6)] = String(value);
  }
  return values;
}

export const actions = {
  createSecret: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(params, locals, 'project:vault:secrets:create');
      const formData = await request.formData();
      await vaultService.createSecret(project.id, {
        folderId: String(formData.get('folderId') || '') || null,
        key: String(formData.get('key') || ''),
        description: String(formData.get('description') || ''),
        values: secretValuesFromForm(formData),
      });
      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudo crear el secreto',
      });
    }
  },
  updateSecret: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(params, locals, 'project:vault:secrets:update');
      const formData = await request.formData();
      await vaultService.updateSecret(project.id, String(formData.get('id') || ''), {
        folderId: String(formData.get('folderId') || '') || null,
        key: String(formData.get('key') || ''),
        description: String(formData.get('description') || ''),
        values: secretValuesFromForm(formData),
      });
      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudo actualizar el secreto',
      });
    }
  },
  deleteSecret: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(params, locals, 'project:vault:secrets:delete');
      const formData = await request.formData();
      await vaultService.deleteSecret(project.id, String(formData.get('id') || ''));
      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudo borrar el secreto',
      });
    }
  },
  deleteFolder: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(params, locals, 'project:vault:secrets:delete');
      const formData = await request.formData();
      await vaultService.deleteFolder(project.id, String(formData.get('id') || ''));
      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudo borrar la carpeta',
      });
    }
  },
  createFolder: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(params, locals, 'project:vault:secrets:create');
      const formData = await request.formData();
      await vaultService.createFolder(project.id, {
        parentFolderId: String(formData.get('parentFolderId') || '') || null,
        name: String(formData.get('name') || ''),
        description: String(formData.get('description') || ''),
      });
      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudo crear la carpeta',
      });
    }
  },
  linkFolder: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(params, locals, 'project:vault:secrets:create');
      const formData = await request.formData();
      const linkedPath = normalizeFolderPath(String(formData.get('linkedPath') || ''));
      const linkedFolder = await vaultService.getFolderByPath(project.id, linkedPath);

      if (!linkedFolder) throw new Error('No se puede enlazar la raiz');

      await vaultService.linkFolder(project.id, {
        parentFolderId: String(formData.get('parentFolderId') || '') || null,
        linkedFolderId: linkedFolder.id,
      });
      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudo enlazar la carpeta',
      });
    }
  },
  importSecrets: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(params, locals, 'project:vault:secrets:create');
      const formData = await request.formData();
      const folderId = String(formData.get('folderId') || '') || null;
      const environmentSlug = String(formData.get('environmentSlug') || params.env);
      await vaultService.importEnvFile(
        project.id,
        environmentSlug,
        folderId,
        String(formData.get('content') || ''),
      );

      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudieron importar los secretos',
      });
    }
  },
  exportSecrets: async ({ params, locals }) => {
    try {
      const project = await getAuthorizedProject(params, locals, 'project:vault:secrets:export');
      const content = await vaultService.exportEnvFile(
        project.id,
        params.env,
        routePath(params.path),
      );
      return { content, filename: `${params.slug}-${params.env}.env` };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudieron exportar los secretos',
      });
    }
  },
  copyEnvironment: async ({ request, params, locals }) => {
    try {
      const project = await getAuthorizedProject(params, locals, 'project:vault:secrets:update');
      const formData = await request.formData();
      await vaultService.copyEnvironmentValues(
        project.id,
        String(formData.get('sourceEnvironment') || ''),
        params.env,
        String(formData.get('folderId') || '') || null,
      );
      return { success: true };
    } catch (err) {
      return fail(err instanceof Error && err.message === 'Forbidden' ? 403 : 400, {
        error: err instanceof Error ? err.message : 'No se pudieron copiar los secretos',
      });
    }
  },
};
