import { error } from '@sveltejs/kit';
import { cancanService } from '../../../../../../../../modules/auth';
import { codeReportCveService } from '../../../../../../../../modules/code-report';
import { highestCvssScore, highestSeverity } from '$lib/code-report/cve-aggregation';

export async function load({ parent, locals, params }) {
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
  const occurrences = occurrencesByCve.get(params.cve);

  if (!occurrences || occurrences.length === 0) {
    throw error(404, 'CVE not found');
  }

  const first = occurrences[0].finding;

  const cve = {
    id: params.cve,
    title: first.title,
    description: first.description,
    severity: highestSeverity(occurrences),
    cvssScore: highestCvssScore(occurrences),
    primaryUrl: first.primaryUrl,
    cveUrl: first.cveUrl,
    cweIds: first.cweIds,
  };

  const affectedServices = occurrences.map((occurrence) => ({
    serviceId: occurrence.serviceId,
    serviceSlug: occurrence.serviceSlug,
    serviceName: occurrence.serviceName,
    packageName: occurrence.finding.packageName,
    installedVersion: occurrence.finding.installedVersion,
    fixedVersion: occurrence.finding.fixedVersion,
    target: occurrence.finding.target,
    severity: occurrence.finding.severity,
    status: occurrence.finding.status,
    scannedAt: occurrence.scannedAt,
  }));

  return { cve, affectedServices };
}
