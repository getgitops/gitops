import { json } from '@sveltejs/kit';
import { codeReportService, codeReportAnalysisService } from '../../../../../modules/code-report';
import { cancanService } from '../../../../../modules/auth';

async function loadServiceForAnalysis(analysisId: string) {
  const analysis = await codeReportAnalysisService.getById(analysisId);
  const service = await codeReportService.getById(analysis.serviceId);
  return { analysis, service };
}

export async function GET({ params, locals }) {
  try {
    const { analysis, service } = await loadServiceForAnalysis(params.id);
    if (
      !(await cancanService.canSessionUser(locals.user, 'openreport:read', {
        scope: 'project',
        projectId: service.projectId,
        organizationId: service.project?.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    return json({ analysis });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 404 });
  }
}

// transitions an in-progress analysis to either 'completed' (with result) or 'failed' (with error)
export async function PATCH({ request, params, locals }) {
  try {
    const { service } = await loadServiceForAnalysis(params.id);
    if (
      !(await cancanService.canSessionUser(locals.user, 'openreport:update', {
        scope: 'project',
        projectId: service.projectId,
        organizationId: service.project?.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = (await request.json()) as {
      status?: 'completed' | 'failed';
      result?: unknown;
      summary?: unknown;
      error?: string;
      gitInfo?: {
        repositoryUrl?: string;
        branch?: string;
        commit?: string;
        commitMessage?: string;
        author?: string;
      };
    };

    if (data.status === 'completed') {
      const analysis = await codeReportAnalysisService.completeAnalysis(params.id, {
        result: data.result,
        summary: data.summary,
        gitInfo: data.gitInfo,
      });
      return json({ success: true, analysis });
    }

    if (data.status === 'failed') {
      const analysis = await codeReportAnalysisService.failAnalysis(params.id, {
        error: String(data.error || ''),
        gitInfo: data.gitInfo,
      });
      return json({ success: true, analysis });
    }

    return json({ error: "status must be 'completed' or 'failed'" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}

export async function DELETE({ params, locals }) {
  try {
    const { service } = await loadServiceForAnalysis(params.id);
    if (
      !(await cancanService.canSessionUser(locals.user, 'openreport:delete', {
        scope: 'project',
        projectId: service.projectId,
        organizationId: service.project?.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    await codeReportAnalysisService.deleteAnalysis(params.id);
    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
