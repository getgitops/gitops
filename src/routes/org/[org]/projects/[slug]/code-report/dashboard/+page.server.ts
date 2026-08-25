import { error } from '@sveltejs/kit';
import { cancanService } from '../../../../../../../modules/auth';
import {
  codeReportAnalysisService,
  codeReportCveService,
  codeReportSecurityPolicyService,
  codeReportService,
} from '../../../../../../../modules/code-report';
import { extractSecrets, summarizeAnalysisResult } from '$lib/code-report/analysis-summary';
import { summarizeCves } from '$lib/code-report/cve-aggregation';
import type { PolicyComplianceReport } from '$lib/code-report/policy-evaluation';
import { mergeComplianceReports } from '$lib/code-report/policy-evaluation';

const STALE_AFTER_DAYS = 30;
const riskWeights = { critical: 10, high: 6, medium: 3, low: 1, unknown: 0 };

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

  const services = await codeReportService.listByProject(project.id);
  const securityPolicies = await codeReportSecurityPolicyService.listByProject(project.id);

  const policyEvaluations: { service: (typeof services)[number]; report: PolicyComplianceReport }[] =
    [];

  const serviceStats = await Promise.all(
    services.map(async (service) => {
      const latest = await codeReportAnalysisService.getLatestByTool(service.id, [
        'trivy',
        'gitleaks',
      ]);
      const trivyAnalysis = latest.trivy?.status === 'completed' ? latest.trivy : null;
      const gitleaksAnalysis = latest.gitleaks?.status === 'completed' ? latest.gitleaks : null;

      const summary = trivyAnalysis
        ? summarizeAnalysisResult(trivyAnalysis.result)
        : summarizeAnalysisResult(null);
      const exposedSecrets = gitleaksAnalysis ? extractSecrets(gitleaksAnalysis.result).length : 0;

      // compliance was evaluated and stored when the analysis completed
      const report = mergeComplianceReports([
        trivyAnalysis?.securityPolicies as PolicyComplianceReport | null,
        gitleaksAnalysis?.securityPolicies as PolicyComplianceReport | null,
      ]);
      if (report) {
        policyEvaluations.push({ service, report });
      }

      const lastScanAt = [latest.trivy?.createdAt, latest.gitleaks?.createdAt]
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;

      return {
        id: service.id,
        slug: service.slug,
        name: service.name,
        scanned: trivyAnalysis !== null,
        severity: summary.vulnerabilities,
        exposedSecrets,
        lastScanAt,
      };
    }),
  );

  const occurrencesByCve = await codeReportCveService.getProjectCveOccurrences(project.id);
  const cves = summarizeCves(occurrencesByCve);

  const remediableCves = [...occurrencesByCve.values()].filter((occurrences) =>
    occurrences.some((occurrence) => occurrence.finding.fixedVersion),
  ).length;

  const severityBreakdown = serviceStats.reduce(
    (totals, service) => ({
      critical: totals.critical + service.severity.critical,
      high: totals.high + service.severity.high,
      medium: totals.medium + service.severity.medium,
      low: totals.low + service.severity.low,
      unknown: totals.unknown + service.severity.unknown,
    }),
    { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
  );

  const staleCutoff = Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const staleServices = serviceStats
    .filter((service) => !service.lastScanAt || new Date(service.lastScanAt).getTime() < staleCutoff)
    .sort((left, right) => {
      if (!left.lastScanAt) return -1;
      if (!right.lastScanAt) return 1;
      return new Date(left.lastScanAt).getTime() - new Date(right.lastScanAt).getTime();
    });

  const riskiestServices = serviceStats
    .map((service) => ({
      ...service,
      riskScore:
        service.severity.critical * riskWeights.critical +
        service.severity.high * riskWeights.high +
        service.severity.medium * riskWeights.medium +
        service.severity.low * riskWeights.low,
    }))
    .filter((service) => service.riskScore > 0)
    .sort((left, right) => right.riskScore - left.riskScore)
    .slice(0, 5);

  const topCves = cves.slice(0, 8);

  const evaluatedServices = policyEvaluations.filter(
    (entry) => entry.report.status === 'compliant' || entry.report.status === 'violated',
  );
  const failingServices = evaluatedServices.filter((entry) => entry.report.status === 'violated');

  const violatedPolicies = new Map<
    string,
    { id: string; name: string; enforcement: string; services: string[] }
  >();
  for (const entry of failingServices) {
    for (const evaluation of entry.report.failed) {
      const existing = violatedPolicies.get(evaluation.policyId);
      if (existing) {
        existing.services.push(entry.service.name);
      } else {
        violatedPolicies.set(evaluation.policyId, {
          id: evaluation.policyId,
          name: evaluation.policyName,
          enforcement: evaluation.enforcement,
          services: [entry.service.name],
        });
      }
    }
  }

  return {
    project,
    kpis: {
      totalServices: services.length,
      scannedServices: serviceStats.filter((service) => service.scanned).length,
      totalCves: cves.length,
      criticalCount: severityBreakdown.critical,
      highCount: severityBreakdown.high,
      exposedSecrets: serviceStats.reduce((total, service) => total + service.exposedSecrets, 0),
      remediationCoveragePercent:
        cves.length > 0 ? Math.round((remediableCves / cves.length) * 100) : null,
      staleServicesCount: staleServices.length,
    },
    securityPolicies: {
      total: securityPolicies.length,
      active: securityPolicies.filter((policy) => policy.enabled).length,
      evaluatedServices: evaluatedServices.length,
      failingServices: failingServices.length,
      compliantServices: evaluatedServices.length - failingServices.length,
      totalViolations: failingServices.reduce(
        (total, entry) => total + entry.report.totalViolations,
        0,
      ),
      violatedPolicies: [...violatedPolicies.values()],
    },
    severityBreakdown,
    topCves,
    riskiestServices,
    staleServices: staleServices.slice(0, 5),
  };
}
