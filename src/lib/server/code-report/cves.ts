/**
 * Datos de las vistas de CVEs (listado y detalle), compartidos por el nivel de proyecto y el de
 * organización. Parten del último análisis Trivy completado de cada servicio.
 */
import { error } from '@sveltejs/kit';
import { cancanService } from '#modules/auth';
import { codeReportCveService, type OrganizationCveOccurrence } from '#modules/code-report';
import { projectService } from '#modules/projects';
import {
  highestCvssScore,
  highestEpssPercentile,
  highestEpssScore,
  highestSeverity,
} from '#lib/code-report/cve-aggregation';
import type { VulnerabilityFinding } from '#lib/code-report/analysis-summary';

export type CveProject = { id: string; slug: string; name: string };

type Severity = VulnerabilityFinding['severity'];

const RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 };

export type CveListItem = {
  id: string;
  title: string;
  severity: Severity;
  cvssScore: number | null;
  epssScore: number | null;
  /** Algún servicio tiene versión corregida disponible. */
  fixable: boolean;
  packages: string[];
  services: { slug: string; name: string; projectSlug: string; projectName: string }[];
  projectSlugs: string[];
  occurrenceCount: number;
  publishedDate: string | null;
};

export type CveDetailData = {
  cve: {
    id: string;
    title: string;
    description: string;
    severity: Severity;
    cvssScore: number | null;
    epssScore: number | null;
    epssPercentile: number | null;
    primaryUrl: string;
    cveUrl: string;
    cweIds: string[];
    references: string[];
    publishedDate: string | null;
    lastModifiedDate: string | null;
  };
  remediations: {
    packageName: string;
    installedVersions: string[];
    fixedVersion: string;
    serviceCount: number;
  }[];
  affected: {
    serviceSlug: string;
    serviceName: string;
    projectSlug: string;
    projectName: string;
    packageName: string;
    installedVersion: string;
    fixedVersion: string;
    target: string;
    severity: Severity;
    status: string;
    scannedAt: string | null;
  }[];
};

type SessionUser = App.Locals['user'];

/** Los CVEs de un proyecto se ven con permiso de informes o de vulnerabilidades. */
export async function requireProjectCveAccess(
  project: { id: string; organization?: { id: string } | null },
  user: SessionUser,
) {
  const scope = {
    scope: 'project' as const,
    projectId: project.id,
    organizationId: project.organization?.id,
  };
  const [reports, vulnerabilities] = await Promise.all([
    cancanService.canSessionUser(user, 'project:codereport:reports:read', scope),
    cancanService.canSessionUser(user, 'project:codereport:vulnerabilities:read', scope),
  ]);
  if (!reports && !vulnerabilities) throw error(403, 'Forbidden');
}

/** Proyectos activos con Code Report de la organización, para la vista global. */
export async function organizationCveProjects(
  organizationId: string,
  user: SessionUser,
): Promise<CveProject[]> {
  const canRead = await cancanService.canSessionUser(user, 'organization:projects:read', {
    scope: 'organization',
    organizationId,
  });
  if (!canRead) throw error(403, 'Forbidden');

  return (await projectService.listProjectsByOrganization(organizationId))
    .filter((project) => project.status === 'active' && project.modules?.codereport)
    .map((project) => ({ id: project.id, slug: project.slug ?? '', name: project.name }));
}

/** Ocurrencias de cada CVE en los proyectos indicados (uno, o todos los de una organización). */
export function loadCveOccurrences(
  projects: CveProject[],
): Promise<Map<string, OrganizationCveOccurrence[]>> {
  return codeReportCveService.getOrganizationCveOccurrences(projects);
}

export function buildCveList(
  occurrencesByCve: Map<string, OrganizationCveOccurrence[]>,
): CveListItem[] {
  return [...occurrencesByCve.entries()]
    .map(([id, occurrences]) => {
      const services = new Map<string, CveListItem['services'][number]>();
      for (const occurrence of occurrences) {
        services.set(`${occurrence.projectSlug}/${occurrence.serviceSlug}`, {
          slug: occurrence.serviceSlug,
          name: occurrence.serviceName,
          projectSlug: occurrence.projectSlug,
          projectName: occurrence.projectName,
        });
      }
      return {
        id,
        title: occurrences.find((occurrence) => occurrence.finding.title)?.finding.title ?? '',
        severity: highestSeverity(occurrences),
        cvssScore: highestCvssScore(occurrences),
        epssScore: highestEpssScore(occurrences),
        fixable: occurrences.some((occurrence) => Boolean(occurrence.finding.fixedVersion)),
        packages: [...new Set(occurrences.map((occurrence) => occurrence.finding.packageName))],
        services: [...services.values()],
        projectSlugs: [...new Set(occurrences.map((occurrence) => occurrence.projectSlug))],
        occurrenceCount: occurrences.length,
        publishedDate:
          occurrences.map((occurrence) => occurrence.finding.publishedDate).find(Boolean) ?? null,
      };
    })
    .sort(
      (left, right) =>
        RANK[right.severity] - RANK[left.severity] ||
        (right.cvssScore ?? 0) - (left.cvssScore ?? 0) ||
        right.services.length - left.services.length,
    );
}

export function buildCveDetail(
  id: string,
  occurrences: OrganizationCveOccurrence[],
): CveDetailData {
  const findings = occurrences.map((occurrence) => occurrence.finding);
  const first = findings.find((finding) => finding.description) ?? findings[0];

  const remediations = new Map<
    string,
    CveDetailData['remediations'][number] & { keys: Set<string> }
  >();
  for (const occurrence of occurrences) {
    const { packageName, installedVersion, fixedVersion } = occurrence.finding;
    const key = `${packageName}@${fixedVersion}`;
    const entry = remediations.get(key) ?? {
      packageName,
      installedVersions: [],
      fixedVersion,
      serviceCount: 0,
      keys: new Set<string>(),
    };
    if (!entry.installedVersions.includes(installedVersion))
      entry.installedVersions.push(installedVersion);
    entry.keys.add(`${occurrence.projectSlug}/${occurrence.serviceSlug}`);
    entry.serviceCount = entry.keys.size;
    remediations.set(key, entry);
  }

  return {
    cve: {
      id,
      title: first?.title ?? '',
      description: first?.description ?? '',
      severity: highestSeverity(occurrences),
      cvssScore: highestCvssScore(occurrences),
      epssScore: highestEpssScore(occurrences),
      epssPercentile: highestEpssPercentile(occurrences),
      primaryUrl: findings.find((finding) => finding.primaryUrl)?.primaryUrl ?? '',
      cveUrl: first?.cveUrl ?? '',
      cweIds: [...new Set(findings.flatMap((finding) => finding.cweIds))],
      references: [...new Set(findings.flatMap((finding) => finding.references))],
      publishedDate: findings.map((finding) => finding.publishedDate).find(Boolean) ?? null,
      lastModifiedDate: findings.map((finding) => finding.lastModifiedDate).find(Boolean) ?? null,
    },
    remediations: [...remediations.values()]
      .map(({ keys: _keys, ...entry }) => entry)
      .sort((left, right) => right.serviceCount - left.serviceCount),
    affected: occurrences
      .map((occurrence) => ({
        serviceSlug: occurrence.serviceSlug,
        serviceName: occurrence.serviceName,
        projectSlug: occurrence.projectSlug,
        projectName: occurrence.projectName,
        packageName: occurrence.finding.packageName,
        installedVersion: occurrence.finding.installedVersion,
        fixedVersion: occurrence.finding.fixedVersion,
        target: occurrence.finding.packagePath || occurrence.finding.target,
        severity: occurrence.finding.severity,
        status: occurrence.finding.status,
        scannedAt: occurrence.scannedAt,
      }))
      .sort(
        (left, right) =>
          left.projectName.localeCompare(right.projectName) ||
          left.serviceName.localeCompare(right.serviceName),
      ),
  };
}
