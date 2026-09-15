import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectService } from '$modules/projects';
import { vaultService } from '$modules/vault';

type UpdateSecretBody = {
  environment?: string;
  value?: string;
  description?: string;
};

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Vault secret operation failed';
}

function notFoundStatus(err: unknown) {
  return err instanceof Error && (err.message === 'Secret not found' || err.message === 'Folder not found')
    ? 404
    : 400;
}

function normalizePath(path: string | null) {
  const segments = (path ?? '').split('/').filter(Boolean);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

// resolves the project from the `projectId` query param and checks the given permission,
// for either a project-scoped API key or a session user
async function authorize(
  url: URL,
  locals: RequestEvent['locals'],
  permission: 'project:vault:secrets:read' | 'project:vault:secrets:update' | 'project:vault:secrets:delete',
) {
  const projectId = url.searchParams.get('projectId')?.trim();
  if (!projectId) {
    return { error: json({ error: 'projectId is required' }, { status: 400 }) };
  }

  const project = await projectService.getProject(projectId).catch(() => null);
  if (!project) {
    return { error: json({ error: 'Project not found' }, { status: 404 }) };
  }

  const organizationId = project.organization?.id ?? null;
  const apiKey = locals.apiKey;
  const context = {
    scope: 'project' as const,
    projectId: project.id,
    organizationId: organizationId ?? undefined,
  };

  if (apiKey) {
    if (apiKey.projectId !== project.id) {
      return { error: json({ error: 'Forbidden' }, { status: 403 }) };
    }
    if (!cancanService.canApiKey(apiKey, permission, context)) {
      return { error: json({ error: 'Forbidden' }, { status: 403 }) };
    }
  } else if (!(await cancanService.canSessionUser(locals.user, permission, context))) {
    return { error: json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { project };
}

// machine-to-machine + session endpoint: reads a secret by key from a project's vault.
export async function GET({ params, url, locals }) {
  const auth = await authorize(url, locals, 'project:vault:secrets:read');
  if (auth.error) return auth.error;

  const path = normalizePath(url.searchParams.get('path'));

  try {
    const folder = await vaultService.getFolderByPath(auth.project.id, path);
    const secret = await vaultService.findSecretByKey(auth.project.id, folder?.id ?? null, params.key);
    if (!secret) return json({ error: 'Secret not found' }, { status: 404 });
    return json({ secret });
  } catch (err) {
    locals.logger?.warn({ err, key: params.key, path }, '[vault] get secret failed');
    return json({ error: errorMessage(err) }, { status: notFoundStatus(err) });
  }
}

// machine-to-machine + session endpoint: sets the description and/or a single environment's
// value of a secret by key. Key and path cannot be changed here.
export async function PATCH({ params, url, request, locals }) {
  const auth = await authorize(url, locals, 'project:vault:secrets:update');
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as UpdateSecretBody;
  const path = normalizePath(url.searchParams.get('path'));

  if (!body.environment?.trim()) {
    return json({ error: 'environment is required' }, { status: 400 });
  }
  if (body.value === undefined) {
    return json({ error: 'value is required' }, { status: 400 });
  }

  try {
    const folder = await vaultService.getFolderByPath(auth.project.id, path);
    const secret = await vaultService.setSecretValue(
      auth.project.id,
      folder?.id ?? null,
      params.key,
      body.environment,
      body.value,
      body.description,
    );
    const { values: _, ...secretWithoutValues } = secret;
    return json({ secret: { ...secretWithoutValues, value: body.value } });
  } catch (err) {
    locals.logger?.warn({ err, key: params.key, path }, '[vault] update secret failed');
    return json({ error: errorMessage(err) }, { status: notFoundStatus(err) });
  }
}

// machine-to-machine + session endpoint: deletes a secret by key from a project's vault.
export async function DELETE({ params, url, locals }) {
  const auth = await authorize(url, locals, 'project:vault:secrets:delete');
  if (auth.error) return auth.error;

  const path = normalizePath(url.searchParams.get('path'));

  try {
    const folder = await vaultService.getFolderByPath(auth.project.id, path);
    await vaultService.deleteSecretByKey(auth.project.id, folder?.id ?? null, params.key);
    return json({ success: true });
  } catch (err) {
    locals.logger?.warn({ err, key: params.key, path }, '[vault] delete secret failed');
    return json({ error: errorMessage(err) }, { status: notFoundStatus(err) });
  }
}
