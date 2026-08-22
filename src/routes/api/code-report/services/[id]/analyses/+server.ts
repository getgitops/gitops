import { json } from '@sveltejs/kit';
import {
  codeReportService,
  codeReportAnalysisService,
} from '../../../../../../modules/code-report';
import { cancanService } from '../../../../../../modules/auth';

export async function GET({ params, locals }) {
  try {
    const service = await codeReportService.getById(params.id);
    if (
      !(await cancanService.canSessionUser(locals.user, 'openreport:read', {
        scope: 'project',
        projectId: service.projectId,
        organizationId: service.project?.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const analyses = await codeReportAnalysisService.listByService(params.id);
    return json({ service: { id: service.id, name: service.name }, analyses });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}

// reports a new analysis run has started for this service, status starts as 'in_progress'
export async function POST({ request, params, locals }) {
  try {
    const service = await codeReportService.getById(params.id);
    if (
      !(await cancanService.canSessionUser(locals.user, 'openreport:create', {
        scope: 'project',
        projectId: service.projectId,
        organizationId: service.project?.organization?.id,
      }))
    ) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = (await request.json()) as {
      tool?: string;
      gitInfo?: {
        repositoryUrl?: string;
        branch?: string;
        commit?: string;
        commitMessage?: string;
        author?: string;
      };
    };

    const analysis = await codeReportAnalysisService.startAnalysis({
      serviceId: service.id,
      tool: String(data.tool || ''),
      gitInfo: data.gitInfo,
    });

    return json({ success: true, service: { id: service.id, name: service.name }, analysis });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 400 });
  }
}
