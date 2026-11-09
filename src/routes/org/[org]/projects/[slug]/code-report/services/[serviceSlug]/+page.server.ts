import { error, fail, redirect } from '@sveltejs/kit';
import { codeReportService, codeReportAnalysisService } from '#modules/code-report';
import { projectService } from '#modules/projects';
import { cancanService } from '#modules/auth';

const CODE_REPORT_TOOLS = ['trivy', 'syft', 'sbom', 'gitleaks'];

export async function load({ parent, params, locals }) {
  const startedAt = performance.now();
  const { project } = await parent();

  const canRead = await cancanService.canSessionUser(
    locals.user,
    'project:codereport:reports:read',
    {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    },
  );

  if (!canRead) {
    throw error(403, 'Forbidden');
  }

  const [canCreate, canDelete] = await Promise.all([
    cancanService.canSessionUser(locals.user, 'project:codereport:reports:create', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    }),
    cancanService.canSessionUser(locals.user, 'project:codereport:reports:delete', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    }),
  ]);

  let service;
  try {
    service = await codeReportService.getByProjectIdAndSlug(project.id, params.serviceSlug);
  } catch (err) {
    if (err instanceof Error && err.message === 'Service not found') {
      throw error(404, 'Service not found');
    }
    throw err;
  }
  const analysesStartedAt = performance.now();
  try {
    const [overview, riskWeights] = await Promise.all([
      codeReportAnalysisService.getServiceOverview(service.id),
      codeReportService.getRiskWeightsByProjectId(project.id),
    ]);
    const { latestAnalysis, latestByTool, analysisHistory } = overview;
    for (const tool of [...(service.tools ?? []), ...CODE_REPORT_TOOLS]) {
      if (!Object.hasOwn(latestByTool, tool)) latestByTool[tool] = null;
    }
    locals.logger.debug(
      {
        serviceId: service.id,
        historyEntries: analysisHistory.length,
        analysesDurationMs: performance.now() - analysesStartedAt,
        durationMs: performance.now() - startedAt,
      },
      'code report service detail loaded',
    );

    return {
      service,
      latestAnalysis,
      latestByTool,
      analysisHistory,
      riskWeights,
      canCreate,
      canDelete,
    };
  } catch (err) {
    locals.logger.error({ err, serviceId: service.id }, 'code report service detail failed');
    throw err;
  }
}

export const actions = {
  deleteService: async ({ params, locals }) => {
    const project = await projectService.getProjectBySlug(params.slug);

    const canDelete = await cancanService.canSessionUser(
      locals.user,
      'project:codereport:reports:delete',
      {
        scope: 'project',
        projectId: project.id,
        organizationId: project.organization?.id,
      },
    );

    if (!canDelete) {
      return fail(403, { error: 'Forbidden' });
    }

    try {
      const service = await codeReportService.getByProjectAndSlug(project.id, params.serviceSlug);
      await codeReportService.deleteService(service.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete service';
      return fail(400, { error: message });
    }

    throw redirect(303, `/org/${params.org}/projects/${params.slug}/code-report/services`);
  },

  uploadAnalysis: async ({ request, params, locals }) => {
    const project = await projectService.getProjectBySlug(params.slug);

    const canCreate = await cancanService.canSessionUser(
      locals.user,
      'project:codereport:reports:create',
      {
        scope: 'project',
        projectId: project.id,
        organizationId: project.organization?.id,
      },
    );

    if (!canCreate) {
      return fail(403, { uploadError: 'Forbidden' });
    }

    const formData = await request.formData();
    const raw = String(formData.get('json') || '').trim();

    if (!raw) {
      return fail(400, { uploadError: 'Pega o sube un archivo JSON.', json: raw });
    }

    let result: unknown;
    try {
      result = JSON.parse(raw);
    } catch {
      return fail(400, { uploadError: 'El contenido no es un JSON válido.', json: raw });
    }

    try {
      const service = await codeReportService.getByProjectAndSlug(project.id, params.serviceSlug);
      await codeReportAnalysisService.uploadAnalysis({ serviceId: service.id, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload analysis';
      return fail(400, { uploadError: message, json: raw });
    }

    return { uploadSuccess: true };
  },
};
