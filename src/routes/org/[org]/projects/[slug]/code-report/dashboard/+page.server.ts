import { error } from '@sveltejs/kit';
import { cancanService } from '#modules/auth';
import {
  codeReportAnalysisService,
  codeReportCveService,
  codeReportSecurityPolicyService,
  codeReportService,
} from '#modules/code-report';
import { extractSecrets, summarizeAnalysisResult } from '#lib/code-report/analysis-summary';
import { summarizeCves } from '#lib/code-report/cve-aggregation';
import { riskLevel } from '#lib/code-report/severity-ui';
import type { PolicyComplianceReport } from '#lib/code-report/policy-evaluation';
import { mergeComplianceReports } from '#lib/code-report/policy-evaluation';

const STALE_AFTER_DAYS = 30;
const TOP_CVES = 10;
const TOP_PACKAGES = 6;
const RECENT_ANALYSES = 6;

export async function load({ parent, locals }) {
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

  const riskWeights = await codeReportService.getRiskWeightsByProjectId(project.id);

  const services = await codeReportService.listByProject(project.id);
  const securityPolicies = await codeReportSecurityPolicyService.listByProject(project.id);

  const policyEvaluations: {
    service: (typeof services)[number];
    report: PolicyComplianceReport;
  }[] = [];

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

      const lastScanAt =
        [latest.trivy?.createdAt, latest.gitleaks?.createdAt]
          .filter((value): value is Date => Boolean(value))
          .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

      return {
        id: service.id,
        slug: service.slug,
        name: service.name,
        violatesPolicy: report?.status === 'violated',
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
    .filter(
      (service) => !service.lastScanAt || new Date(service.lastScanAt).getTime() < staleCutoff,
    )
    .sort((left, right) => {
      if (!left.lastScanAt) return -1;
      if (!right.lastScanAt) return 1;
      return new Date(left.lastScanAt).getTime() - new Date(right.lastScanAt).getTime();
    });

  const riskiestServices = serviceStats
    .map((service) => {
      const riskScore = codeReportService.calculateRiskScore(service.severity, riskWeights);
      return {
        ...service,
        riskScore,
        level: riskLevel(riskScore, service.severity.critical).key,
      };
    })
    .filter((service) => service.riskScore > 0 || service.exposedSecrets > 0)
    .sort(
      (left, right) =>
        right.riskScore - left.riskScore || right.exposedSecrets - left.exposedSecrets,
    )
    .slice(0, 6);

  // CVEs únicos por severidad (un CVE en varios servicios cuenta una vez)
  const cvesBySeverity = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const cve of cves) cvesBySeverity[cve.severity] += 1;

  // críticos y altos, con lo necesario para actuar: paquete, versión con corrección y servicios
  const topCves = cves
    .filter((cve) => cve.severity === 'critical' || cve.severity === 'high')
    .slice(0, TOP_CVES)
    .map((cve) => {
      const occurrences = occurrencesByCve.get(cve.id) ?? [];
      const first = occurrences[0]?.finding;
      const services = [
        ...new Map(
          occurrences.map((occurrence) => [
            occurrence.serviceSlug,
            { slug: occurrence.serviceSlug, name: occurrence.serviceName },
          ]),
        ).values(),
      ];
      return {
        ...cve,
        packageName: first?.packageName ?? '',
        installedVersion: first?.installedVersion ?? '',
        fixedVersion:
          occurrences.find((occurrence) => occurrence.finding.fixedVersion)?.finding.fixedVersion ??
          '',
        services,
      };
    });

  // paquetes que más CVEs críticos/altos arrastran: actualizar uno arregla varios
  const packageMap = new Map<
    string,
    {
      name: string;
      cves: Set<string>;
      critical: Set<string>;
      high: Set<string>;
      fixable: Set<string>;
      services: Set<string>;
    }
  >();
  for (const [cveId, occurrences] of occurrencesByCve) {
    for (const occurrence of occurrences) {
      const name = occurrence.finding.packageName || '—';
      const entry = packageMap.get(name) ?? {
        name,
        cves: new Set(),
        critical: new Set(),
        high: new Set(),
        fixable: new Set(),
        services: new Set(),
      };
      entry.cves.add(cveId);
      if (occurrence.finding.severity === 'critical') entry.critical.add(cveId);
      if (occurrence.finding.severity === 'high') entry.high.add(cveId);
      if (occurrence.finding.fixedVersion) entry.fixable.add(cveId);
      entry.services.add(occurrence.serviceId);
      packageMap.set(name, entry);
    }
  }
  const topPackages = [...packageMap.values()]
    .filter((entry) => entry.critical.size + entry.high.size > 0)
    .map((entry) => ({
      name: entry.name,
      cves: entry.cves.size,
      critical: entry.critical.size,
      high: entry.high.size,
      fixable: entry.fixable.size,
      services: entry.services.size,
    }))
    .sort(
      (left, right) =>
        right.critical - left.critical || right.high - left.high || right.cves - left.cves,
    )
    .slice(0, TOP_PACKAGES);

  const secretsByService = serviceStats
    .filter((service) => service.exposedSecrets > 0)
    .sort((left, right) => right.exposedSecrets - left.exposedSecrets)
    .map((service) => ({
      slug: service.slug,
      name: service.name,
      exposedSecrets: service.exposedSecrets,
    }));

  const serviceById = new Map(services.map((service) => [service.id, service]));
  const recentAnalyses = (
    await codeReportAnalysisService
      .listByProject(services.map((service) => service.id))
      .catch(() => [])
  )
    .slice(0, RECENT_ANALYSES)
    .map((analysis) => ({
      id: analysis.id,
      tool: analysis.tool,
      status: analysis.status,
      createdAt: new Date(analysis.createdAt).toISOString(),
      serviceName: serviceById.get(analysis.serviceId)?.name ?? null,
      critical:
        analysis.tool === 'trivy' && analysis.status === 'completed'
          ? summarizeAnalysisResult(analysis.result).vulnerabilities.critical
          : null,
    }));

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
      criticalCves: cvesBySeverity.critical,
      highCves: cvesBySeverity.high,
      servicesWithSecrets: secretsByService.length,
      remediableCves,
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
    cvesBySeverity,
    topCves,
    topPackages,
    riskiestServices,
    secretsByService: secretsByService.slice(0, 6),
    recentAnalyses,
    staleServices: staleServices.slice(0, 5).map((service) => ({
      id: service.id,
      slug: service.slug,
      name: service.name,
      scanned: service.scanned,
      lastScanAt: service.lastScanAt ? new Date(service.lastScanAt).toISOString() : null,
    })),
  };
}
