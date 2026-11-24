import * as env from '$app/env/private';

export type MonitoringConfig = {
  /** Shared secret of the internal worker API; `null` disables it. */
  workerToken: string | null;
  /** Host headers accepted on the internal API; empty: any. */
  internalHosts: string[];
  embeddedWorker: boolean;
  embeddedWorkerConcurrency: number;
  allowPrivateTargets: boolean;
  /** Log every finished check of the embedded worker. */
  checkLogs: boolean;
  flushSeconds: number;
  hourlyRetentionDays: number;
  incidentRetentionDays: number;
};

export type MonitoringRepositoryConfig = {
  repositoryUrl: string;
  branch: string;
  dataPath: string | null;
  token: string | null;
};

function value(name: keyof typeof env): string | null {
  const raw = env[name]?.trim();
  if (!raw) return null;
  const quote = raw[0];
  return (quote === '"' || quote === "'") && raw.endsWith(quote)
    ? raw.slice(1, -1).trim() || null
    : raw;
}

function bool(name: keyof typeof env, fallback: boolean): boolean {
  const raw = value(name)?.toLowerCase();
  if (raw === undefined || raw === null) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function int(name: keyof typeof env, fallback: number, min: number, max: number): number {
  const raw = value(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export function readMonitoringConfig(): MonitoringConfig {
  return {
    workerToken: value('MONITORING_WORKER_TOKEN'),
    internalHosts: (value('MONITORING_INTERNAL_HOSTS') ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
    embeddedWorker: bool('MONITORING_EMBEDDED_WORKER', true),
    embeddedWorkerConcurrency: int('MONITORING_EMBEDDED_WORKER_CONCURRENCY', 20, 1, 500),
    allowPrivateTargets: bool('MONITORING_ALLOW_PRIVATE_TARGETS', false),
    checkLogs: bool('MONITORING_CHECK_LOGS', true),
    flushSeconds: int('MONITORING_FLUSH_SECONDS', 300, 30, 3600),
    hourlyRetentionDays: int('MONITORING_HOURLY_RETENTION_DAYS', 30, 1, 365),
    incidentRetentionDays: int('MONITORING_INCIDENT_RETENTION_DAYS', 365, 7, 3650),
  };
}

/** The dedicated metrics repository, or `null` to keep metrics in the main GitDB. */
export function readMonitoringRepositoryConfig(): MonitoringRepositoryConfig | null {
  const repositoryUrl = value('MONITORING_GITDB_REPOSITORY_URL');
  if (!repositoryUrl) return null;
  return {
    repositoryUrl,
    branch: value('MONITORING_GITDB_BRANCH') ?? 'main',
    dataPath: value('MONITORING_GITDB_DATA_PATH'),
    token: value('MONITORING_GITDB_TOKEN'),
  };
}
