import { error } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { codeReportAnalysisService, codeReportService } from '$modules/code-report';

export async function load({ parent, params, locals }) {
  const { project } = await parent();
  if (
    !(await cancanService.canSessionUser(locals.user, 'project:codereport:reports:read', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    }))
  )
    throw error(403, 'Forbidden');
  const analysis = await codeReportAnalysisService.getById(params.analysisID);
  const services = await codeReportService.listByProject(project.id);
  const service = services.find((item) => item.id === analysis.serviceId);
  if (!service) throw error(404, 'Analysis not found');

  const riskWeights = await codeReportService.getRiskWeightsByProjectId(project.id);

  return {
    service,
    analysis,
    riskWeights,
    analysisHistory: await codeReportAnalysisService.listByService(service.id),
  };
}
