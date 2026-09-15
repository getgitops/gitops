import { json } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectService } from '$modules/projects';
import { vaultService } from '$modules/vault';

const FORMATS = ['env', 'json'] as const;
type ExportFormat = (typeof FORMATS)[number];

function normalizePath(path: string | null) {
  const segments = (path ?? '').split('/').filter(Boolean);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Vault export failed';
}

// machine-to-machine + session endpoint: exports the secrets of a project path for one
// environment. The identity's organization must own the project, whatever its permissions are.
export async function GET({ url, locals }) {
  const log = locals.logger;
  const projectId = url.searchParams.get('projectId')?.trim();
  const environmentSlug = url.searchParams.get('env')?.trim();
  const format = (url.searchParams.get('format')?.trim() || 'env') as ExportFormat;
  const path = normalizePath(url.searchParams.get('path'));

  if (!projectId) {
    return json({ error: 'projectId is required' }, { status: 400 });
  }
  if (!environmentSlug) {
    return json({ error: 'env is required' }, { status: 400 });
  }
  if (!FORMATS.includes(format)) {
    return json({ error: "format must be 'env' or 'json'" }, { status: 400 });
  }

  const project = await projectService.getProject(projectId).catch(() => null);
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
    // the caller only learns it was rejected; the mismatch detail stays in the logs
    if (apiKey.projectId !== project.id) {
      log?.warn(
        { keyId: apiKey.id, keyProjectId: apiKey.projectId, projectId: project.id },
        '[vault] export rejected: API key belongs to another project',
      );
      return json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!cancanService.canApiKey(apiKey, 'project:vault:secrets:export', context)) {
      log?.warn(
        { keyId: apiKey.id, projectId: project.id },
        '[vault] export rejected: API key lacks project:vault:secrets:export',
      );
      return json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (
    !(await cancanService.canSessionUser(locals.user, 'project:vault:secrets:export', context))
  ) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const content =
      format === 'json'
        ? await vaultService.exportJsonFile(project.id, environmentSlug, path)
        : await vaultService.exportEnvFile(project.id, environmentSlug, path);

    const filename = `${project.slug}-${environmentSlug}.${format}`;

    return new Response(content, {
      headers: {
        'content-type':
          format === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    log?.warn({ err, projectId, environmentSlug, path }, '[vault] export failed');
    return json({ error: errorMessage(err) }, { status: 400 });
  }
}
