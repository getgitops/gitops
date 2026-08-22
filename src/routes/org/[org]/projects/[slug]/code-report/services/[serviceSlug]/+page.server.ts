import { error, fail, redirect } from '@sveltejs/kit';
import {
  codeReportService,
  codeReportAnalysisService,
} from '../../../../../../../../modules/code-report';
import { projectService } from '../../../../../../../../modules/projects';
import { cancanService } from '../../../../../../../../modules/auth';

export async function load({ parent, params, locals }) {
  const { project } = await parent();

  const canRead = await cancanService.canSessionUser(locals.user, 'openreport:read', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });

  if (!canRead) {
    throw error(403, 'Forbidden');
  }

  try {
    const service = await codeReportService.getByProjectAndSlug(project.id, params.serviceSlug);
    const analyses = await codeReportAnalysisService.listByService(service.id);
    const latestAnalysis = analyses[0] ?? null;
    const analysisHistory = analyses
      .filter((analysis) => analysis.status === 'completed')
      .map((analysis) => ({
        id: analysis.id,
        createdAt: analysis.createdAt,
        result: analysis.result,
        summary: analysis.summary,
        status: analysis.status,
        tool: analysis.tool,
        gitInfo: analysis.gitInfo,
        error: analysis.error,
        updatedAt: analysis.updatedAt,
      }));

    return { service, latestAnalysis, analysisHistory };
  } catch {
    throw error(404, 'Service not found');
  }
}

export const actions = {
  deleteService: async ({ params, locals }) => {
    const project = await projectService.getProjectBySlug(params.slug);

    const canDelete = await cancanService.canSessionUser(locals.user, 'openreport:delete', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    });

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

    const canCreate = await cancanService.canSessionUser(locals.user, 'openreport:create', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    });

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
