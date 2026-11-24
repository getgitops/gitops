import { error } from '@sveltejs/kit';
import { cancanService, userAccessService } from '#modules/auth';
import { alertService } from '#modules/alerts';
import { projectService } from '#modules/projects';
import { eventLog } from '#lib/server/events';
import {
  HEALTH_THRESHOLDS,
  codeReportHealth,
  keyHealth,
  monitoringHealth,
  vaultHealth,
  type CodeReportHealth,
  type KeyHealth,
  type MonitoringHealth,
  type VaultHealth,
} from '#lib/server/dashboard/project-health';
import { createEventVisibility } from '../settings/events/event-view';

/**
 * Dashboard de la organización: estado de todos sus proyectos y lo que hay que revisar.
 * Cada métrica de un proyecto se calcula solo si el producto está activo y el usuario puede
 * leerlo en ese proyecto; un fallo en una no tumba el resto. Al cliente solo llegan conteos.
 */

type Project = {
  id: string;
  slug: string | null;
  name: string;
  description?: string | null;
  status: string;
  modules?: { vault?: boolean; codereport?: boolean; monitoring?: boolean };
};

export type AttentionSeverity = 'critical' | 'warning' | 'info';

export type AttentionKind =
  | 'monitorsDown'
  | 'exposedSecrets'
  | 'criticalVulns'
  | 'keysExpired'
  | 'monitorsDegraded'
  | 'keysExpiring'
  | 'keysNotRotated'
  | 'keysNoExpiry'
  | 'keysUnused'
  | 'staleScans'
  | 'vaultMissing'
  | 'vaultStale'
  | 'invitedUsers'
  | 'pendingEvents';

export type AttentionItem = {
  severity: AttentionSeverity;
  kind: AttentionKind;
  count: number;
  project: { slug: string; name: string } | null;
  href: string;
  /** Nombres concretos (monitores, claves) para dar contexto; nunca secretos. */
  names?: string[];
};

export type ProjectHealthStatus = 'critical' | 'warning' | 'ok' | 'unknown';

const PENDING_EVENTS_SCAN = 500;

async function safely<T>(
  logger: App.Locals['logger'] | undefined,
  label: string,
  task: () => Promise<T>,
): Promise<T | null> {
  try {
    return await task();
  } catch (err) {
    logger?.error({ err }, `organization dashboard: ${label} failed`);
    return null;
  }
}

function attentionFor(
  project: { slug: string; name: string },
  base: string,
  health: {
    codeReport: CodeReportHealth | null;
    monitoring: MonitoringHealth | null;
    vault: VaultHealth | null;
    keys: KeyHealth | null;
  },
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const push = (
    severity: AttentionSeverity,
    kind: AttentionKind,
    count: number,
    href: string,
    names?: string[],
  ) => {
    if (count > 0) items.push({ severity, kind, count, project, href, names });
  };
  const { codeReport, monitoring, vault, keys } = health;

  if (monitoring) {
    const down = monitoring.failing.filter((monitor) => monitor.status === 'down');
    const degraded = monitoring.failing.filter((monitor) => monitor.status === 'degraded');
    push(
      'critical',
      'monitorsDown',
      down.length,
      `${base}/monitoring/monitors`,
      down.map((m) => m.name),
    );
    push(
      'warning',
      'monitorsDegraded',
      degraded.length,
      `${base}/monitoring/monitors`,
      degraded.map((m) => m.name),
    );
  }
  if (codeReport) {
    push('critical', 'exposedSecrets', codeReport.exposedSecrets, `${base}/code-report/services`);
    push('critical', 'criticalVulns', codeReport.totals.critical, `${base}/code-report/dashboard`);
    push('warning', 'staleScans', codeReport.staleServices, `${base}/code-report/services`);
  }
  if (keys) {
    const keysHref = `${base}/settings/server-access-keys`;
    const named = (risk: keyof KeyHealth['counts']) =>
      keys.atRisk.filter((key) => key.risks.includes(risk)).map((key) => key.name);
    push('critical', 'keysExpired', keys.counts.expired, keysHref, named('expired'));
    push('warning', 'keysExpiring', keys.counts.expiring, keysHref, named('expiring'));
    push('warning', 'keysNotRotated', keys.counts.notRotated, keysHref, named('notRotated'));
    push('info', 'keysNoExpiry', keys.counts.noExpiry, keysHref, named('noExpiry'));
    push('info', 'keysUnused', keys.counts.unused, keysHref, named('unused'));
  }
  if (vault) {
    push('warning', 'vaultMissing', vault.missingValues, `${base}/vault`);
    push('info', 'vaultStale', vault.staleSecrets, `${base}/vault`);
  }
  return items;
}

function statusOf(items: AttentionItem[], hasData: boolean): ProjectHealthStatus {
  if (items.some((item) => item.severity === 'critical')) return 'critical';
  if (items.some((item) => item.severity === 'warning')) return 'warning';
  return hasData ? 'ok' : 'unknown';
}

export async function load({ locals, parent }) {
  const { organization } = await parent();

  if (!(await cancanService.canViewOrganization(locals.user, organization.id))) {
    throw error(403, 'Forbidden');
  }

  const logger = locals.logger;
  const orgScope = { scope: 'organization' as const, organizationId: organization.id };
  const canOrg = (permission: string) =>
    cancanService.canSessionUser(locals.user, permission, orgScope);

  const [allProjects, canReadUsers, canReadEvents, canReadAlerts] = await Promise.all([
    projectService.listProjectsByOrganization(organization.id) as Promise<Project[]>,
    canOrg('organization:users:read'),
    canOrg('organization:events:read'),
    canOrg('organization:alerts:read'),
  ]);
  const activeProjects = allProjects.filter((project) => project.status === 'active');
  const orgBase = `/org/${organization.slug}`;

  const projects = await Promise.all(
    activeProjects.map(async (project) => {
      const slug = project.slug ?? project.id;
      const base = `${orgBase}/projects/${slug}`;
      const modules = project.modules ?? {};
      const scope = {
        scope: 'project' as const,
        projectId: project.id,
        organizationId: organization.id,
      };
      const can = (permission: string) =>
        cancanService.canSessionUser(locals.user, permission, scope);

      const [canCodeReport, canMonitoring, canVault, canKeys] = await Promise.all([
        modules.codereport ? can('project:codereport:reports:read') : false,
        modules.monitoring ? can('project:monitoring:monitors:read') : false,
        modules.vault ? can('project:vault:secrets:read') : false,
        can('project:server-keys:read'),
      ]);

      const [codeReport, monitoring, vault, keys] = await Promise.all([
        canCodeReport ? safely(logger, 'code report', () => codeReportHealth(project.id)) : null,
        canMonitoring ? safely(logger, 'monitoring', () => monitoringHealth(project.id)) : null,
        canVault ? safely(logger, 'vault', () => vaultHealth(project.id)) : null,
        canKeys ? safely(logger, 'keys', () => keyHealth(project.id)) : null,
      ]);

      const attention = attentionFor({ slug, name: project.name }, base, {
        codeReport,
        monitoring,
        vault,
        keys,
      });

      return {
        id: project.id,
        slug,
        name: project.name,
        description: project.description ?? null,
        modules: {
          codereport: Boolean(modules.codereport),
          vault: Boolean(modules.vault),
          monitoring: Boolean(modules.monitoring),
        },
        status: statusOf(attention, Boolean(codeReport || monitoring || vault || keys)),
        issues: {
          critical: attention.filter((item) => item.severity === 'critical').length,
          warning: attention.filter((item) => item.severity === 'warning').length,
        },
        codeReport: codeReport && {
          score: codeReport.score,
          critical: codeReport.totals.critical,
          high: codeReport.totals.high,
          services: codeReport.services,
          scanned: codeReport.scanned,
          exposedSecrets: codeReport.exposedSecrets,
          lastScanAt: codeReport.lastScanAt,
        },
        monitoring: monitoring && {
          total: monitoring.total,
          up: monitoring.up,
          down: monitoring.down,
          degraded: monitoring.degraded,
          uptime24h: monitoring.uptime24h,
        },
        vault: vault && { secrets: vault.secrets, missingValues: vault.missingValues },
        keys: keys && { active: keys.active, atRisk: keys.atRisk.length },
        attention,
      };
    }),
  );

  // nivel organización
  const [users, pendingEvents, alerts] = await Promise.all([
    canReadUsers
      ? safely(logger, 'users', async () => {
          const rows = await userAccessService.listUsers('organization', organization.id);
          return {
            total: rows.length,
            active: rows.filter((row) => row.status === 'active' && !row.disabled).length,
            invited: rows.filter((row) => row.status === 'invited').length,
            disabled: rows.filter((row) => row.disabled).length,
          };
        })
      : null,
    canReadEvents
      ? safely(logger, 'events', async () => {
          const isVisible = createEventVisibility(organization.id, (permission, context) =>
            cancanService.canSessionUser(locals.user, permission, context),
          );
          const candidates = eventLog.list({
            organizationId: organization.id,
            acked: false,
            limit: PENDING_EVENTS_SCAN,
          });
          let count = 0;
          for (const entry of candidates) if (await isVisible(entry)) count += 1;
          return count;
        })
      : null,
    canReadAlerts
      ? safely(logger, 'alerts', async () => {
          const list = await alertService.list({
            organizationId: organization.id,
            projectId: null,
          });
          return { total: list.length, enabled: list.filter((alert) => alert.enabled).length };
        })
      : null,
  ]);

  const orgAttention: AttentionItem[] = [];
  if (users?.invited) {
    orgAttention.push({
      severity: 'info',
      kind: 'invitedUsers',
      count: users.invited,
      project: null,
      href: `${orgBase}/settings/access-control`,
    });
  }
  if (pendingEvents) {
    orgAttention.push({
      severity: 'info',
      kind: 'pendingEvents',
      count: pendingEvents,
      project: null,
      href: `${orgBase}/settings/events?status=pending`,
    });
  }

  const severityRank: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };
  const attention = [...projects.flatMap((project) => project.attention), ...orgAttention].sort(
    (left, right) =>
      severityRank[left.severity] - severityRank[right.severity] || right.count - left.count,
  );

  const sum = (pick: (project: (typeof projects)[number]) => number | null | undefined) =>
    projects.reduce((total, project) => total + (pick(project) ?? 0), 0);
  const scores = projects
    .map((project) => project.codeReport?.score)
    .filter((score): score is number => typeof score === 'number');
  const uptimes = projects
    .map((project) => project.monitoring?.uptime24h)
    .filter((value): value is number => typeof value === 'number');

  return {
    dashboard: {
      generatedAt: new Date().toISOString(),
      thresholds: HEALTH_THRESHOLDS,
      projects: projects.map(({ attention: _attention, ...project }) => project),
      archivedProjects: allProjects.length - activeProjects.length,
      attention,
      users,
      alerts,
      pendingEvents,
      totals: {
        securityScore: scores.length
          ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
          : null,
        critical: sum((project) => project.codeReport?.critical),
        high: sum((project) => project.codeReport?.high),
        exposedSecrets: sum((project) => project.codeReport?.exposedSecrets),
        services: sum((project) => project.codeReport?.services),
        monitors: sum((project) => project.monitoring?.total),
        monitorsUp: sum((project) => project.monitoring?.up),
        monitorsFailing: sum(
          (project) => (project.monitoring?.down ?? 0) + (project.monitoring?.degraded ?? 0),
        ),
        uptime24h: uptimes.length
          ? uptimes.reduce((total, value) => total + value, 0) / uptimes.length
          : null,
        secrets: sum((project) => project.vault?.secrets),
        keys: sum((project) => project.keys?.active),
        keysAtRisk: sum((project) => project.keys?.atRisk),
      },
      can: {
        createProject: await canOrg('organization:projects:create'),
        manageUsers: canReadUsers,
      },
    },
  };
}
