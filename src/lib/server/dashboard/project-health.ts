/**
 * Salud de un proyecto por producto, para los dashboards. Cada función lee un producto y
 * devuelve solo conteos y metadatos: nunca valores de secretos, tokens ni resultados completos.
 * Quien llama comprueba antes que el producto está activo y que el usuario puede leerlo.
 */
import { apiKeysService } from '#modules/auth';
import { codeReportAnalysisService, codeReportService } from '#modules/code-report';
import { monitorService, monitoringRuntime } from '#modules/monitoring';
import { vaultService } from '#modules/vault';
import { extractSecrets, summarizeAnalysisResult } from '#lib/code-report/analysis-summary';
import { riskLevel, type RiskLevel } from '#lib/code-report/severity-ui';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Umbrales de lo que el dashboard considera "a revisar". */
export const HEALTH_THRESHOLDS = {
  /** Un servicio sin analizar en este tiempo está desactualizado. */
  staleScanDays: 30,
  /** Una clave que no se ha rotado en este tiempo. */
  keyRotationDays: 90,
  /** Una clave que caduca en menos de esto. */
  keyExpiringDays: 14,
  /** Una clave sin usar en este tiempo (o nunca usada tras este tiempo). */
  keyUnusedDays: 30,
  /** Un secreto del vault que no ha cambiado en este tiempo. */
  secretRotationDays: 180,
} as const;

export type Severity = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
};

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

const time = (value: unknown) => new Date(value as string | Date).getTime();

export type CodeReportHealth = {
  score: number | null;
  totals: Severity;
  services: number;
  scanned: number;
  staleServices: number;
  exposedSecrets: number;
  lastScanAt: string | null;
};

export async function codeReportHealth(
  projectId: string,
  now = Date.now(),
): Promise<CodeReportHealth> {
  const [services, riskWeights] = await Promise.all([
    codeReportService.listByProject(projectId),
    codeReportService.getRiskWeightsByProjectId(projectId),
  ]);
  const analyses = await codeReportAnalysisService.listByProject(
    services.map((service) => service.id),
  );

  // último análisis completado de cada herramienta por servicio
  const latestScan = new Map<string, { at: number; severity: Severity }>();
  const latestSecrets = new Map<string, { at: number; count: number }>();
  const lastAnalysisAt = new Map<string, number>();
  for (const analysis of analyses) {
    const at = time(analysis.createdAt);
    lastAnalysisAt.set(
      analysis.serviceId,
      Math.max(lastAnalysisAt.get(analysis.serviceId) ?? 0, at),
    );
    if (analysis.status !== 'completed') continue;
    if (analysis.tool === 'trivy' && at >= (latestScan.get(analysis.serviceId)?.at ?? 0)) {
      latestScan.set(analysis.serviceId, {
        at,
        severity: summarizeAnalysisResult(analysis.result).vulnerabilities as Severity,
      });
    }
    if (analysis.tool === 'gitleaks' && at >= (latestSecrets.get(analysis.serviceId)?.at ?? 0)) {
      latestSecrets.set(analysis.serviceId, { at, count: extractSecrets(analysis.result).length });
    }
  }

  const totals: Severity = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const scan of latestScan.values()) {
    for (const key of Object.keys(totals) as (keyof Severity)[]) totals[key] += scan.severity[key];
  }

  let points = 0;
  for (const service of services) {
    const scan = latestScan.get(service.id);
    if (!scan) continue;
    const level = riskLevel(
      codeReportService.calculateRiskScore(scan.severity, riskWeights),
      scan.severity.critical,
    ).key;
    const servicePoints = LEVEL_POINTS[level];
    const exposed = (latestSecrets.get(service.id)?.count ?? 0) > 0;
    points += exposed ? Math.min(servicePoints, EXPOSED_SECRETS_CAP) : servicePoints;
  }

  const staleCutoff = now - HEALTH_THRESHOLDS.staleScanDays * DAY_MS;
  const last = Math.max(0, ...lastAnalysisAt.values());

  return {
    score: latestScan.size ? Math.round(points / latestScan.size) : null,
    totals,
    services: services.length,
    scanned: latestScan.size,
    staleServices: services.filter((service) => (lastAnalysisAt.get(service.id) ?? 0) < staleCutoff)
      .length,
    exposedSecrets: [...latestSecrets.values()].reduce((sum, entry) => sum + entry.count, 0),
    lastScanAt: last ? new Date(last).toISOString() : null,
  };
}

export type MonitoringHealth = {
  total: number;
  up: number;
  down: number;
  degraded: number;
  paused: number;
  uptime24h: number | null;
  /** Monitores caídos o degradados, primero los caídos. */
  failing: { id: string; name: string; status: 'down' | 'degraded'; since: string | null }[];
};

export async function monitoringHealth(projectId: string): Promise<MonitoringHealth> {
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
      status: (monitor.enabled ? (entry?.status ?? 'pending') : 'paused') as string,
      since: entry?.since ? new Date(entry.since).toISOString() : null,
      uptime24h: entry?.uptime.h24 ?? null,
    };
  });
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  const uptimes = rows
    .map((row) => row.uptime24h)
    .filter((value): value is number => typeof value === 'number');

  return {
    total: rows.length,
    up: count('up'),
    down: count('down'),
    degraded: count('degraded'),
    paused: count('paused'),
    uptime24h: uptimes.length
      ? uptimes.reduce((sum, value) => sum + value, 0) / uptimes.length
      : null,
    failing: rows
      .filter((row) => row.status === 'down' || row.status === 'degraded')
      .sort((left, right) => (left.status === 'down' ? 0 : 1) - (right.status === 'down' ? 0 : 1))
      .map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status as 'down' | 'degraded',
        since: row.since,
      })),
  };
}

export type VaultHealth = {
  secrets: number;
  environments: number;
  /** Valores vacíos: secretos que no tienen valor en algún entorno. */
  missingValues: number;
  /** Secretos sin cambios desde hace más de `secretRotationDays`. */
  staleSecrets: number;
};

export async function vaultHealth(projectId: string, now = Date.now()): Promise<VaultHealth> {
  const vault = await vaultService.getProjectVault(projectId);
  const secrets = vault.secrets as {
    values?: Record<string, string>;
    updatedAt?: unknown;
    createdAt?: unknown;
  }[];
  const environments = vault.environments as { slug: string }[];
  const cutoff = now - HEALTH_THRESHOLDS.secretRotationDays * DAY_MS;

  return {
    secrets: secrets.length,
    environments: environments.length,
    missingValues: secrets.reduce(
      (sum, secret) =>
        sum + environments.filter((environment) => !secret.values?.[environment.slug]).length,
      0,
    ),
    staleSecrets: secrets.filter((secret) => {
      const changed = time(secret.updatedAt ?? secret.createdAt);
      return Number.isFinite(changed) && changed < cutoff;
    }).length,
  };
}

export type KeyRisk = 'expired' | 'expiring' | 'noExpiry' | 'notRotated' | 'unused';

export type KeyHealth = {
  active: number;
  /** Claves con algún riesgo, la de mayor riesgo primero. */
  atRisk: {
    id: string;
    name: string;
    keyPrefix: string;
    risks: KeyRisk[];
    expiresAt: string | null;
    lastUsedAt: string | null;
    rotatedAt: string;
  }[];
  counts: Record<KeyRisk, number>;
};

const KEY_RISK_ORDER: KeyRisk[] = ['expired', 'expiring', 'notRotated', 'noExpiry', 'unused'];

export async function keyHealth(projectId: string, now = Date.now()): Promise<KeyHealth> {
  const keys = (await apiKeysService.listActiveApiKeysByProject(projectId)).filter(
    (key) => !key.revokedAt,
  );
  const counts: Record<KeyRisk, number> = {
    expired: 0,
    expiring: 0,
    noExpiry: 0,
    notRotated: 0,
    unused: 0,
  };

  const atRisk = keys
    .map((key) => {
      const risks: KeyRisk[] = [];
      const expiresAt = key.expiresAt ? time(key.expiresAt) : null;
      const rotatedAt = time(key.rotatedAt ?? key.createdAt);
      const lastUsed = key.lastUsedAt ? time(key.lastUsedAt) : null;

      if (expiresAt !== null && expiresAt <= now) risks.push('expired');
      else if (expiresAt !== null && expiresAt - now < HEALTH_THRESHOLDS.keyExpiringDays * DAY_MS)
        risks.push('expiring');
      if (expiresAt === null) risks.push('noExpiry');
      if (now - rotatedAt > HEALTH_THRESHOLDS.keyRotationDays * DAY_MS) risks.push('notRotated');
      if (
        now - (lastUsed ?? rotatedAt) > HEALTH_THRESHOLDS.keyUnusedDays * DAY_MS &&
        !risks.includes('expired')
      )
        risks.push('unused');

      for (const risk of risks) counts[risk] += 1;
      return {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        risks,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        rotatedAt: new Date(rotatedAt).toISOString(),
      };
    })
    .filter((key) => key.risks.length > 0)
    .sort(
      (left, right) =>
        Math.min(...left.risks.map((risk) => KEY_RISK_ORDER.indexOf(risk))) -
        Math.min(...right.risks.map((risk) => KEY_RISK_ORDER.indexOf(risk))),
    );

  return { active: keys.length, atRisk, counts };
}
