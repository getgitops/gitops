import { error } from '@sveltejs/kit';
import { cancanService } from '../../../../../../../modules/auth';
import { codeReportCveService } from '../../../../../../../modules/code-report';
import { summarizeCves } from '$lib/code-report/cve-aggregation';

export async function load({ parent, locals }) {
  const { project } = await parent();

  const canRead = await cancanService.canSessionUser(locals.user, 'openreport:read', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });

  if (!canRead) {
    throw error(403, 'Forbidden');
  }

  const occurrencesByCve = await codeReportCveService.getProjectCveOccurrences(project.id);

  return { cves: summarizeCves(occurrencesByCve) };
}
