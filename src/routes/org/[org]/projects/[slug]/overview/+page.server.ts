import { apiKeysService, cancanService, roleService, userAccessService } from '#modules/auth';
import { codeReportAnalysisService, codeReportService } from '#modules/code-report';
import { vaultService } from '#modules/vault';
import { eventLog } from '#lib/server/events';
import { createEventVisibility, toEventView, type EventView } from '#lib/server/events/event-view';
import { extractSecrets, summarizeAnalysisResult } from '#lib/code-report/analysis-summary';
import {
  mergeComplianceReports,
  type PolicyComplianceReport,
} from '#lib/code-report/policy-evaluation';
import {
  securityScore,
  serviceHealth,
  totalSeverity,
  weightedFindings,
  type ServiceHealth,
  type SeverityCounts,
} from '#lib/projects/overview';

/** Scans plotted in each service's trend sparkline */
const TREND_POINTS = 10;
const RECENT_SCANS = 6;
const ACTIVITY_ITEMS = 6;
const STALE_AFTER_DAYS = 30;

const NO_FINDINGS: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

export type OverviewService = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tags: string[];
  health: ServiceHealth;
  severity: SeverityCounts;
  exposedSecrets: number;
  policy: PolicyComplianceReport['status'] | null;
  /** Weighted findings of the last scans, oldest first */
  trend: number[];
  lastScanAt: string | null;
  stale: boolean;
  branch: string | null;
};

export type OverviewScan = {
  id: string;
  service: { name: string; slug: string };
  tool: string;
  status: 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  branch: string | null;
  commit: string | null;
  /** Vulnerabilities (trivy) or secrets (gitleaks) found; `null` until completed */
  findings: number | null;
};

const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
const shortCommit = (commit: string | null | undefined) => (commit ? commit.slice(0, 7) : null);

/**
 * Project overview. Every block is computed only when its module is enabled and the viewer may
 * read it; otherwise it is `null` and the page explains why. Vault only exposes counts and dates,
 * never secret values.
 */
export async function load({ parent, locals }) {
  const { project } = await parent();
  const organizationId: string | undefined = project.organization?.id;
  const modules = project.modules ?? { vault: true, codereport: true, stateiac: true };

  const can = (permission: string) =>
    cancanService.canSessionUser(locals.user, permission, {
      scope: 'project',
      projectId: project.id,
      organizationId,
    });

  const [
    canReadCodeReport,
    canCreateService,
    canReadSecrets,
    canReadEnvironments,
    canReadUsers,
    canReadSettings,
  ] = await Promise.all([
    can('project:codereport:reports:read'),
    can('project:codereport:reports:create'),
    can('project:vault:secrets:read'),
    can('project:vault:environments:read'),
    can('project:users:read'),
    can('project:project:read'),
  ]);

  // --- Code Report: services, score, trends and recent scans --------------------------------
  const services =
    modules.codereport && canReadCodeReport
      ? await codeReportService.listByProject(project.id)
      : null;

  let codeReport: {
    services: OverviewService[];
    totals: SeverityCounts;
    exposedSecrets: number;
    score: ReturnType<typeof securityScore>;
    staleCount: number;
    recentScans: OverviewScan[];
  } | null = null;

  if (services) {
    const staleCutoff = Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
    const rows = await Promise.all(
      services.map(async (service): Promise<OverviewService> => {
        const overview = await codeReportAnalysisService.getServiceOverview(service.id);
        const trivy = overview.latestByTool.trivy;
        const gitleaks = overview.latestByTool.gitleaks;
        const trivyDone = trivy?.status === 'completed' ? trivy : null;
        const gitleaksDone = gitleaks?.status === 'completed' ? gitleaks : null;

        const vulnerabilities = trivyDone
          ? summarizeAnalysisResult(trivyDone.result).vulnerabilities
          : null;
        const severity = vulnerabilities
          ? {
              critical: vulnerabilities.critical,
              high: vulnerabilities.high,
              medium: vulnerabilities.medium,
              low: vulnerabilities.low,
            }
          : NO_FINDINGS;
        const exposedSecrets = gitleaksDone ? extractSecrets(gitleaksDone.result).length : 0;
        // compliance was evaluated and stored when each analysis completed
        const report = mergeComplianceReports([
          trivyDone?.securityPolicies as PolicyComplianceReport | null,
          gitleaksDone?.securityPolicies as PolicyComplianceReport | null,
        ]);
        const latest = overview.latestAnalysis;
        const lastScanAt = iso(latest?.createdAt);

        return {
          id: service.id,
          slug: service.slug,
          name: service.name,
          description: service.description ?? null,
          tags: service.tags ?? [],
          health: serviceHealth({
            scanned: trivyDone !== null,
            severity,
            exposedSecrets,
            policyViolated: report?.status === 'violated',
          }),
          severity,
          exposedSecrets,
          policy: report?.status ?? null,
          trend: overview.analysisHistory
            .filter((entry) => entry.tool.toLowerCase() === 'trivy')
            .slice(0, TREND_POINTS)
            .reverse()
            .map((entry) => weightedFindings(entry.visualizationSummary.vulnerabilities)),
          lastScanAt,
          stale: !lastScanAt || new Date(lastScanAt).getTime() < staleCutoff,
          branch: latest?.gitInfo?.branch ?? null,
        };
      }),
    );

    // worst first: critical, warning, unscanned, healthy; then by name
    const order: Record<ServiceHealth, number> = {
      critical: 0,
      warning: 1,
      unscanned: 2,
      healthy: 3,
    };
    rows.sort((a, b) => order[a.health] - order[b.health] || a.name.localeCompare(b.name));

    const byId = new Map(services.map((service) => [service.id, service]));
    const analyses = services.length
      ? await codeReportAnalysisService.listByProject(services.map((service) => service.id))
      : [];
    const recentScans: OverviewScan[] = analyses.slice(0, RECENT_SCANS).map((analysis) => {
      const service = byId.get(analysis.serviceId);
      const completed = analysis.status === 'completed';
      return {
        id: analysis.id,
        service: { name: service?.name ?? analysis.serviceId, slug: service?.slug ?? '' },
        tool: analysis.tool,
        status: analysis.status,
        createdAt: iso(analysis.createdAt) ?? '',
        branch: analysis.gitInfo?.branch ?? null,
        commit: shortCommit(analysis.gitInfo?.commit),
        findings: !completed
          ? null
          : analysis.tool.toLowerCase() === 'gitleaks'
            ? extractSecrets(analysis.result).length
            : summarizeAnalysisResult(analysis.result).totalVulnerabilities,
      };
    });

    codeReport = {
      services: rows,
      totals: totalSeverity(rows),
      exposedSecrets: rows.reduce((total, row) => total + row.exposedSecrets, 0),
      score: securityScore(rows.map((row) => row.health)),
      staleCount: rows.filter((row) => row.stale).length,
      recentScans,
    };
  }

  // --- Vault: counts and dates only --------------------------------------------------------
  let vault: {
    secrets: number | null;
    environments: { name: string; slug: string }[];
    lastModifiedAt: string | null;
  } | null = null;
  if (modules.vault && (canReadSecrets || canReadEnvironments)) {
    const data = await vaultService.getProjectVault(project.id);
    const lastModified = data.secrets
      .map((secret) => new Date(secret.updatedAt as unknown as string).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    vault = {
      secrets: canReadSecrets ? data.secrets.length : null,
      environments: data.environments.map((environment) => ({
        name: environment.name,
        slug: environment.slug,
      })),
      lastModifiedAt: canReadSecrets && lastModified ? new Date(lastModified).toISOString() : null,
    };
  }

  // --- Members ------------------------------------------------------------------------------
  let members: { count: number; sample: string[] } | null = null;
  if (canReadUsers) {
    const rows = await userAccessService.listUsers('project', project.id).catch(() => []);
    const active = new Map<string, string>();
    for (const row of rows) if (row.status === 'active') active.set(row.userId, row.username);
    members = { count: active.size, sample: [...active.values()].slice(0, 5) };
  }

  // --- Activity: the project's domain events the viewer may read ---------------------------
  let activity: EventView[] = [];
  if (organizationId) {
    const isVisible = createEventVisibility(organizationId, (permission, context) =>
      cancanService.canSessionUser(locals.user, permission, context),
    );
    const visible = [];
    for (const entry of eventLog.list({ organizationId })) {
      if (entry.event.scope.projectId !== project.id) continue;
      if (await isVisible(entry)) visible.push(entry);
      if (visible.length >= ACTIVITY_ITEMS) break;
    }
    if (visible.length) {
      // names for the ids events carry; a failed lookup only leaves the raw id
      const [users, apiKeys, roles, serviceRows] = await Promise.all([
        userAccessService.listAssignableUsers().catch(() => []),
        apiKeysService.listActiveApiKeysByProject(project.id).catch(() => []),
        roleService.listRoles('project', project.id).catch(() => []),
        services ?? codeReportService.listByProject(project.id).catch(() => []),
      ]);
      const lookups = {
        usernames: new Map<string, string>(
          users.map((user: { id: string; username: string }) => [user.id, user.username]),
        ),
        projectNames: new Map([[project.id, project.name]]),
        apiKeyNames: new Map(apiKeys.map((key) => [key.id, key.name])),
        roleNames: new Map<string, string>(roles.map((role) => [role.id, role.name])),
        serviceNames: new Map(serviceRows.map((service) => [service.id, service.name])),
      };
      activity = visible
        .map((entry) => toEventView(entry, lookups))
        .filter((view): view is EventView => view !== null);
    }
  }

  return {
    modules,
    codeReport,
    vault,
    members,
    activity,
    canCreateService,
    canReadSettings,
    canReadCodeReport,
  };
}
