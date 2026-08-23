import { json } from '@sveltejs/kit';
import { codeReportService, codeReportAnalysisService } from '../../../../modules/code-report';
import { apiKeysService } from '../../../../modules/auth';

type AnalyseResultBody = {
  service?: string;
  createService?: boolean;
  gitInfo?: {
    repository?: string;
    repositoryUrl?: string;
    branch?: string;
    commit?: string;
    commitMessage?: string;
    author?: string;
  };
  status?: string;
  error?: unknown;
  result?: unknown;
};

const STATUS_MAP: Record<string, 'in_progress' | 'completed' | 'failed'> = {
  'in progress': 'in_progress',
  in_progress: 'in_progress',
  completed: 'completed',
  failed: 'failed',
};

function normalizeGitInfo(gitInfo: AnalyseResultBody['gitInfo']) {
  if (!gitInfo) return undefined;
  return {
    repositoryUrl: gitInfo.repositoryUrl || gitInfo.repository || null,
    branch: gitInfo.branch ?? null,
    commit: gitInfo.commit ?? null,
    commitMessage: gitInfo.commitMessage ?? null,
    author: gitInfo.author ?? null,
  };
}

function normalizeError(error: unknown): string | undefined {
  if (error === undefined || error === null) return undefined;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// single machine-to-machine endpoint for CI/CD tools: authenticates via a project-scoped
// server access key (Authorization: Bearer gvs_...), not a browser session
export async function POST({ request }) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return json({ error: 'Missing API key' }, { status: 401 });
  }

  const apiKey = await apiKeysService.resolveApiKey(token);
  if (!apiKey || !apiKey.projectId) {
    return json({ error: 'Invalid or unscoped API key' }, { status: 401 });
  }

  const body = (await request.json()) as AnalyseResultBody;

  const slug = String(body.service || '').trim();
  if (!slug) {
    return json({ error: 'service is required' }, { status: 400 });
  }

  const status =
    STATUS_MAP[
      String(body.status || '')
        .toLowerCase()
        .trim()
    ];
  if (!status) {
    return json(
      { error: "status must be 'in progress', 'completed' or 'failed'" },
      { status: 400 },
    );
  }

  try {
    let service = await codeReportService.findBySlugGlobal(slug);

    if (!service) {
      if (!body.createService) {
        return json({ error: 'Service not found' }, { status: 404 });
      }
      service = await codeReportService.createService({
        projectId: apiKey.projectId,
        name: slug,
        slug,
      });
    } else if (service.projectId !== apiKey.projectId) {
      return json({ error: 'Service does not belong to this API key project' }, { status: 403 });
    }

    const analysis = await codeReportAnalysisService.reportAnalysis({
      serviceId: service.id,
      status,
      gitInfo: normalizeGitInfo(body.gitInfo),
      result: body.result,
      error: normalizeError(body.error),
    });

    return json({ success: true, service: { id: service.id, slug: service.slug }, analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
