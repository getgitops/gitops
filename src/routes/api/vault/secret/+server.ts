import { json } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectService } from '$modules/projects';
import { vaultService } from '$modules/vault';

type CreateSecretBody = {
  project?: string;
  path?: string;
  key?: string;
  description?: string;
  values?: Record<string, string>;
};

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Vault secret creation failed';
}

function normalizePath(path: string | undefined) {
  const segments = (path ?? '').split('/').filter(Boolean);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

// machine-to-machine + session endpoint: creates a secret in a project's vault.
export async function POST({ request, locals }) {
  const log = locals.logger;
  const body = (await request.json().catch(() => ({}))) as CreateSecretBody;
  const projectSlug = body.project?.trim();
  const path = normalizePath(body.path);

  if (!projectSlug) {
    return json({ error: 'project is required' }, { status: 400 });
  }
  if (!body.key?.trim()) {
    return json({ error: 'key is required' }, { status: 400 });
  }

  const project = await projectService.tryFindBySlug(projectSlug);
  if (!project) {
    return json({ error: 'Project not found' }, { status: 404 });
  }

  const organizationId = project.organization?.id ?? null;
  const apiKey = locals.apiKey;
  const context = {
    scope: 'project' as const,
    projectId: project.id,
    organizationId: organizationId ?? undefined,
  };

  if (apiKey) {
    if (!apiKey.organizationId || apiKey.organizationId !== organizationId) {
      return json({ error: 'Project does not belong to the token organization' }, { status: 403 });
    }
    if (!cancanService.canApiKey(apiKey, 'project:vault:secrets:create', context)) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (
    !(await cancanService.canSessionUser(locals.user, 'project:vault:secrets:create', context))
  ) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const folder = await vaultService.getFolderByPath(project.id, path);
    const secret = await vaultService.createSecret(project.id, {
      folderId: folder?.id ?? null,
      key: body.key,
      description: body.description,
      values: body.values,
    });
    return json({ secret }, { status: 201 });
  } catch (err) {
    log?.warn({ err, projectSlug, key: body.key, path }, '[vault] create secret failed');
    return json(
      { error: errorMessage(err) },
      { status: err instanceof Error && err.message === 'Folder not found' ? 404 : 400 },
    );
  }
}

