import { error } from '@sveltejs/kit';
import { cancanService } from '../../../../../../../modules/auth';
import {
  codeReportAnalysisService,
  codeReportService,
} from '../../../../../../../modules/code-report';

export async function load({ parent, locals }) {
  const { project } = await parent();
  if (
    !(await cancanService.canSessionUser(locals.user, 'openreport:read', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    }))
  )
    throw error(403, 'Forbidden');
    
  const riskWeights = await codeReportService.getRiskWeightsByProjectId(project.id);
  
  const services = await codeReportService.listByProject(project.id);
  const analyses = await codeReportAnalysisService.listByProject(
    services.map((service) => service.id),
  );
  const serviceById = new Map(services.map((service) => [service.id, service]));
  return {
    services,
    riskWeights,
    analyses: analyses.map((analysis) => ({
      ...analysis,
      service: serviceById.get(analysis.serviceId),
    })),
  };
}
