import { json } from '@sveltejs/kit';
import { codeReportService, codeReportAnalysisService } from '$modules/code-report';
import { projectService } from '$modules/projects';
import { cancanService } from '$modules/auth';

type ProjectSettingsTool = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  scanner?: string;
  soon?: boolean;
};

const DEFAULT_CODE_REPORT_TOOLS: ProjectSettingsTool[] = [
  {
    id: 'trivy',
    name: 'Vulnerabilidades (Trivy)',
    description: 'Escaneo de vulnerabilidades y severidad de dependencias con Trivy.',
    enabled: true,
    scanner: 'trivy',
  },
  {
    id: 'syft',
    name: 'Dependencias, SBOM y Licencias (Syft)',
    description: 'Inventario de dependencias, generación de SBOM y análisis de licencias con Syft.',
    enabled: true,
    scanner: 'syft',
  },
  {
    id: 'gitleaks',
    name: 'Secretos (Gitleaks)',
    description: 'Detección de secretos expuestos en el repositorio con Gitleaks.',
    enabled: true,
    scanner: 'gitleaks',
  },
  {
    id: 'code-coverage',
    name: 'Code Coverage',
    description: 'Métricas de cobertura de código por servicio.',
    enabled: false,
    scanner: 'code-coverage',
    soon: true,
  },
];

type AnalyseResultBody = {
  service: string;
  project: string;
  analysisId?: string;
  gitInfo?: {
    repositoryUrl?: string;
    branch?: string;
    commit?: string;
    commitMessage?: string;
    version?: string;
    author?: string;
    committer?: string;
  };
  status?: string;
  error?: string | null;
  result?: unknown;
  tool: string;
};

const STATUS_MAP: Record<string, 'start' | 'in_progress' | 'completed' | 'failed'> = {
  start: 'start',
  in_progress: 'in_progress',
  completed: 'completed',
  failed: 'failed',
};

function normalizeGitInfo(gitInfo: AnalyseResultBody['gitInfo']) {
  if (!gitInfo) return undefined;
  return {
    repositoryUrl: gitInfo.repositoryUrl || null,
    branch: gitInfo.branch ?? null,
    commit: gitInfo.commit ?? null,
    commitMessage: gitInfo.commitMessage ?? null,
    author: gitInfo.author ?? null,
    committer: gitInfo.committer ?? null,
    version: gitInfo.version ?? null,
  };
}

// single machine-to-machine endpoint for CI/CD tools: authenticates via a project-scoped
// server access key (Authorization: Bearer gvs_...), not a browser session
export async function POST({ request, locals }) {
  const apiKey = locals.apiKey;
  const log = locals.logger;

  if (!apiKey?.projectId) {
    return json({ error: 'A project-scoped API key is required' }, { status: 401 });
  }

  const body = (await request.json()) as AnalyseResultBody;

  const status =
    STATUS_MAP[
      String(body.status || '')
        .toLowerCase()
        .trim()
    ];
  if (!status) {
    return json(
      { error: "status must be 'in_progress', 'completed' or 'failed'" },
      { status: 400 },
    );
  }

  let message = '';
  let analysis;
  let tools: string[] = [];
  let activeSettingsTools: ProjectSettingsTool[] = [];
  if (['start', 'in_progress'].includes(status)) {
    //use service and project to find or create the service
    if (!body.service) {
      return json({ error: 'service is required' }, { status: 400 });
    }
    if (!body.project) {
      return json({ error: 'project is required' }, { status: 400 });
    }

    const project = await projectService.getProjectBySlug(body.project).catch(() => null);
    if (!project) {
      return json({ error: 'project not found' }, { status: 404 });
    }

    if (project.id !== apiKey.projectId) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    if (
      !cancanService.canApiKey(apiKey, 'project:codereport:reports:create', {
        scope: 'project',
        projectId: project.id,
      })
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const codeReportSettings = project.settings?.['code-report'] || {};
    const persistedTools = Array.isArray(codeReportSettings.tools)
      ? (codeReportSettings.tools as ProjectSettingsTool[])
      : [];
    const persistedById = new Map(
      persistedTools
        .filter((tool) => tool && typeof tool.id === 'string')
        .map((tool) => [tool.id, tool]),
    );

    const resolvedTools = DEFAULT_CODE_REPORT_TOOLS.map((tool) => {
      const persisted = persistedById.get(tool.id);
      return {
        ...tool,
        enabled: persisted?.enabled ?? tool.enabled,
      };
    });

    activeSettingsTools = resolvedTools.filter((tool) => tool.enabled && !tool.soon);

    const configuredScanners = activeSettingsTools
      .map((tool) => tool.scanner || tool.id)
      .filter(Boolean)
      .map((scanner) => scanner.toLowerCase());

    tools = [...new Set(configuredScanners)];

    let serviceCodeReport = await codeReportService
      .getByProjectAndSlug(body.project, body.service)
      .catch(async (err) => {
        log.warn({ err }, 'service lookup failed, creating service');
        return await codeReportService.createService({
          project: body.project,
          name: body.service,
        });
      });
    if (tools.length === 0) {
      tools = serviceCodeReport?.tools || [];
    }
    log.info({ serviceId: serviceCodeReport?.id }, 'service found or created');
    if (status === 'start') {
      message = 'Scan started';
    } else if (status === 'in_progress') {
      log.info(
        { serviceId: serviceCodeReport?.id, tool: body.tool },
        'starting analysis for service',
      );
      analysis = await codeReportAnalysisService.startAnalysis({
        serviceId: serviceCodeReport?.id || '',
        tool: body.tool,
        gitInfo: normalizeGitInfo(body.gitInfo),
      });
      log.debug({ analysisId: analysis?.id }, 'analysis started');
      message = `Scan in progress with tool ${body.tool}.`;
    }
  } else {
    // completed or failed
    // use analysisId to find
    if (!body.analysisId) {
      return json({ error: 'analysisId is required for failed status' }, { status: 400 });
    }
    if (status === 'failed') {
      await codeReportAnalysisService.failAnalysis(body.analysisId, {
        error: body.error || 'Unknown error',
        gitInfo: normalizeGitInfo(body.gitInfo),
      });
      message = 'Scan failed saved';
    } else if (status === 'completed') {
      await codeReportAnalysisService.completeAnalysis(body.analysisId, {
        result: body.result,
        summary: undefined,
        gitInfo: normalizeGitInfo(body.gitInfo),
      });
    }
  }

  log.info({ status, tools }, 'scan status processed');
  return json({
    success: true,
    message: message,
    analysis: {
      status,
      id: analysis?.id,
    },
    tools,
    activeSettingsTools,
  });
}
