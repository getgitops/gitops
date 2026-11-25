import { alertService } from '#modules/alerts';
import { cancanService } from '#modules/auth';
import { codeReportAnalysisService, codeReportService } from '#modules/code-report';
import { monitorService, monitoringRuntime } from '#modules/monitoring';
import { vaultService } from '#modules/vault';
import { extractSecrets, summarizeAnalysisResult } from '#lib/code-report/analysis-summary';
import { riskLevel, type RiskLevel } from '#lib/code-report/severity-ui';

/**
 * Dashboard del proyecto: un resumen por producto activo. Cada bloque se calcula aparte, solo si
 * el producto está activo y el usuario puede leerlo, y un fallo en uno no tumba el resto.
 * Al cliente solo llegan conteos: nunca valores de secretos ni resultados completos de análisis.
 */

const DELTA_DAYS = 7;
const STALE_AFTER_DAYS = 30;

type LevelKey = RiskLevel['key'];
/** Puntos de un servicio según su nivel de riesgo (mismos rangos que los ajustes de Code Report). */
const LEVEL_POINTS: Record<LevelKey, number> = {
  none: 100,
  low: 90,
  medium: 65,
  high: 35,
  critical: 10,
};
/** Un servicio con secretos expuestos no puntúa más de esto, sea cual sea su nivel. */
const EXPOSED_SECRETS_CAP = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

type Severity = { critical: number; high: number; medium: number; low: number; unknown: number };

type Project = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  status?: string;
  modules?: { vault?: boolean; codereport?: boolean; stateiac?: boolean; monitoring?: boolean };
  organization?: { id: string; slug?: string | null; name?: string | null } | null;
};

async function safely<T>(
  logger: App.Locals['logger'] | undefined,
  label: string,
  task: () => Promise<T>,
): Promise<T | null> {
  try {
    return await task();
  } catch (err) {
    logger?.error({ err }, `project dashboard: ${label} failed`);
    return null;
  }
}

function toTime(value: unknown): number {
  return new Date(value as string | Date).getTime();
}

async function loadCodeReport(projectId: string) {
  const [services, riskWeights] = await Promise.all([
    codeReportService.listByProject(projectId),
    codeReportService.getRiskWeightsByProjectId(projectId),
  ]);
  const analyses = await codeReportAnalysisService.listByProject(
    services.map((service) => service.id),
  );
  const serviceById = new Map(services.map((service) => [service.id, service]));

  // análisis de vulnerabilidades completados, del más antiguo al más reciente, ya resumidos
  const scans = analyses
    .filter((analysis) => analysis.tool === 'trivy' && analysis.status === 'completed')
    .map((analysis) => ({
      serviceId: analysis.serviceId,
      at: toTime(analysis.createdAt),
      severity: summarizeAnalysisResult(analysis.result).vulnerabilities as Severity,
    }))
    .sort((left, right) => left.at - right.at);

  const latestScan = new Map<string, (typeof scans)[number]>();
  for (const scan of scans) latestScan.set(scan.serviceId, scan);

  const latestSecrets = new Map<string, number>();
  for (const analysis of [...analyses].reverse()) {
    if (analysis.tool === 'gitleaks' && analysis.status === 'completed') {
      latestSecrets.set(analysis.serviceId, extractSecrets(analysis.result).length);
    }
  }

  const totals: Severity = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const scan of latestScan.values()) {
    for (const key of Object.keys(totals) as (keyof Severity)[]) totals[key] += scan.severity[key];
  }

  const staleCutoff = Date.now() - STALE_AFTER_DAYS * DAY_MS;
  const serviceRows = services.map((service) => {
    const scan = latestScan.get(service.id) ?? null;
    const lastAnalysis = analyses.find((analysis) => analysis.serviceId === service.id);
    const riskScore = scan ? codeReportService.calculateRiskScore(scan.severity, riskWeights) : 0;
    return {
      slug: service.slug,
      name: service.name,
      severity: scan?.severity ?? null,
      riskScore,
      level: scan ? riskLevel(riskScore, scan.severity.critical).key : null,
      exposedSecrets: latestSecrets.get(service.id) ?? 0,
      lastScanAt: lastAnalysis ? new Date(lastAnalysis.createdAt).toISOString() : null,
    };
  });

  // puntuación 0-100: media de los servicios analizados según su nivel de riesgo
  const scored = serviceRows.filter((service) => service.level !== null);
  const score = scored.length
    ? Math.round(
        scored.reduce((sum, service) => {
          const points = LEVEL_POINTS[service.level as LevelKey];
          return (
            sum + (service.exposedSecrets > 0 ? Math.min(points, EXPOSED_SECRETS_CAP) : points)
          );
        }, 0) / scored.length,
      )
    : null;
  const levels: Record<LevelKey, number> = { none: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const service of scored) levels[service.level as LevelKey] += 1;

  // críticas abiertas ahora frente a hace 7 días (último análisis de cada servicio a esa fecha)
  const criticalAt = (until: number) => {
    const latest = new Map<string, Severity>();
    for (const scan of scans) if (scan.at <= until) latest.set(scan.serviceId, scan.severity);
    if (latest.size === 0) return null;
    return [...latest.values()].reduce((sum, severity) => sum + severity.critical, 0);
  };
  const before = criticalAt(Date.now() - DELTA_DAYS * DAY_MS);
  const criticalDelta = before === null ? null : totals.critical - before;

  return {
    totals,
    services: {
      total: services.length,
      scanned: latestScan.size,
      stale: serviceRows.filter(
        (service) => !service.lastScanAt || toTime(service.lastScanAt) < staleCutoff,
      ).length,
    },
    exposedSecrets: [...latestSecrets.values()].reduce((sum, count) => sum + count, 0),
    score,
    levels,
    criticalDelta,
    riskiest: serviceRows
      .filter((service) => service.riskScore > 0 || service.exposedSecrets > 0)
      .sort((left, right) => right.riskScore - left.riskScore)
      .slice(0, 5),
    recent: analyses.slice(0, 6).map((analysis) => {
      const service = serviceById.get(analysis.serviceId);
      return {
        id: analysis.id,
        tool: analysis.tool,
        status: analysis.status,
        createdAt: new Date(analysis.createdAt).toISOString(),
        serviceName: service?.name ?? null,
        critical:
          analysis.tool === 'trivy' && analysis.status === 'completed'
            ? summarizeAnalysisResult(analysis.result).vulnerabilities.critical
            : null,
      };
    }),
  };
}

async function loadVault(projectId: string) {
  const vault = await vaultService.getProjectVault(projectId);
  const secrets = vault.secrets as { values?: Record<string, string> }[];
  const environments = (vault.environments as { slug: string; name: string; order?: number }[])
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));

  return {
    secrets: secrets.length,
    folders: vault.folders.length,
    environments: environments.map((environment) => {
      const filled = secrets.filter((secret) => Boolean(secret.values?.[environment.slug])).length;
      return {
        slug: environment.slug,
        name: environment.name,
        filled,
        missing: secrets.length - filled,
      };
    }),
  };
}

async function loadMonitoring(projectId: string) {
  const [monitors, records] = await Promise.all([
    monitorService.listByProject(projectId),
    monitorService.listRecordsByProject(projectId),
  ]);
  const stats = await monitoringRuntime.stats(records).catch(() => []);
  const statsById = new Map(stats.map((entry) => [entry.monitorId, entry]));

  const rows = monitors.map((monitor) => {
    const entry = statsById.get(monitor.id);
    return {
      id: monitor.id,
      name: monitor.name,
      url: monitor.displayUrl,
      status: (monitor.enabled ? (entry?.status ?? 'pending') : 'paused') as string,
      since: entry?.since ?? null,
      uptime24h: entry?.uptime.h24 ?? null,
      uptime30d: entry?.uptime.d30 ?? null,
      latencyP95: entry?.latency24h.p95 ?? null,
      hourlyBars: entry?.hourlyBars ?? [],
    };
  });

  const count = (status: string) => rows.filter((row) => row.status === status).length;
  const average = (values: (number | null)[]) => {
    const known = values.filter((value): value is number => typeof value === 'number');
    return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
  };

  // primero lo que está caído o degradado
  const order: Record<string, number> = { down: 0, degraded: 1, pending: 2, up: 3, paused: 4 };
  return {
    total: rows.length,
    up: count('up'),
    down: count('down'),
    degraded: count('degraded'),
    paused: count('paused'),
    pending: count('pending'),
    uptime24h: average(rows.map((row) => row.uptime24h)),
    uptime30d: average(rows.map((row) => row.uptime30d)),
    latencyP95: average(rows.map((row) => row.latencyP95)),
    monitors: rows
      .sort((left, right) => (order[left.status] ?? 9) - (order[right.status] ?? 9))
      .slice(0, 5),
  };
}

export async function load({ parent, locals }) {
  const { project } = (await parent()) as { project: Project };
  const modules = project.modules ?? {};
  const scope = {
    scope: 'project' as const,
    projectId: project.id,
    organizationId: project.organization?.id,
  };
  const can = (permission: string) => cancanService.canSessionUser(locals.user, permission, scope);

  const [
    canReadVault,
    canReadCodeReport,
    canReadMonitoring,
    canReadAlerts,
    canCreateSecret,
    canCreateService,
    canCreateMonitor,
    canCreateAlert,
    canManageMembers,
    canManageKeys,
    canUpdateProject,
  ] = await Promise.all([
    can('project:vault:secrets:read'),
    can('project:codereport:reports:read'),
    can('project:monitoring:monitors:read'),
    can('project:alerts:read'),
    can('project:vault:secrets:create'),
    can('project:codereport:reports:create'),
    can('project:monitoring:monitors:create'),
    can('project:alerts:create'),
    can('project:users:invite'),
    can('project:server-keys:create'),
    can('project:project:update'),
  ]);

  const logger = locals.logger;
  const [codeReport, vault, monitoring, alerts] = await Promise.all([
    modules.codereport && canReadCodeReport
      ? safely(logger, 'code report', () => loadCodeReport(project.id))
      : null,
    modules.vault && canReadVault ? safely(logger, 'vault', () => loadVault(project.id)) : null,
    modules.monitoring && canReadMonitoring
      ? safely(logger, 'monitoring', () => loadMonitoring(project.id))
      : null,
    canReadAlerts
      ? safely(logger, 'alerts', async () => {
          const list = await alertService.list({
            organizationId: project.organization?.id ?? '',
            projectId: project.id,
          });
          return { total: list.length, enabled: list.filter((alert) => alert.enabled).length };
        })
      : null,
  ]);

  return {
    dashboard: {
      modules: {
        vault: Boolean(modules.vault),
        codereport: Boolean(modules.codereport),
        monitoring: Boolean(modules.monitoring),
        stateiac: Boolean(modules.stateiac),
      },
      access: {
        vault: canReadVault,
        codereport: canReadCodeReport,
        monitoring: canReadMonitoring,
      },
      codeReport,
      vault,
      monitoring,
      alerts,
      can: {
        createSecret: canCreateSecret,
        createService: canCreateService,
        createMonitor: canCreateMonitor,
        createAlert: canCreateAlert,
        manageMembers: canManageMembers,
        manageKeys: canManageKeys,
        updateProject: canUpdateProject,
      },
      generatedAt: new Date().toISOString(),
    },
  };
}
