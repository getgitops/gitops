/**
 * Pure rules behind the project overview: how healthy each Code Report service is and the
 * project's security score. Shared by the loader and its tests; no I/O here.
 */

export type SeverityCounts = {
  critical: number;
  high: number;
  medium: number;
  low: number;
};

/**
 * - `unscanned`: no completed vulnerability scan yet
 * - `critical`: critical vulnerabilities, exposed secrets or a violated security policy
 * - `warning`: high vulnerabilities (but nothing critical)
 * - `healthy`: none of the above
 */
export type ServiceHealth = 'unscanned' | 'critical' | 'warning' | 'healthy';

export type ServiceHealthInput = {
  scanned: boolean;
  severity: SeverityCounts;
  exposedSecrets: number;
  policyViolated: boolean;
};

export function serviceHealth(service: ServiceHealthInput): ServiceHealth {
  if (!service.scanned) return 'unscanned';
  if (service.severity.critical > 0 || service.exposedSecrets > 0 || service.policyViolated) {
    return 'critical';
  }
  if (service.severity.high > 0) return 'warning';
  return 'healthy';
}

export type SecurityScore = {
  /** 0–100, or `null` when no service has been scanned yet */
  value: number | null;
  /** Scanned services with no critical vulnerabilities, exposed secrets or policy violations */
  passing: number;
  scanned: number;
};

/**
 * Share of scanned services that pass: no critical vulnerabilities, no exposed secrets and no
 * violated security policy (`warning` services still pass). Unscanned services are left out, so
 * the score is about what is known, and the overview shows how many are unscanned next to it.
 */
export function securityScore(health: readonly ServiceHealth[]): SecurityScore {
  const scanned = health.filter((state) => state !== 'unscanned');
  const passing = scanned.filter((state) => state !== 'critical').length;
  return {
    value: scanned.length ? Math.round((passing / scanned.length) * 100) : null,
    passing,
    scanned: scanned.length,
  };
}

/** Sum of severity counts across services */
export function totalSeverity(services: readonly { severity: SeverityCounts }[]): SeverityCounts {
  return services.reduce(
    (totals, service) => ({
      critical: totals.critical + service.severity.critical,
      high: totals.high + service.severity.high,
      medium: totals.medium + service.severity.medium,
      low: totals.low + service.severity.low,
    }),
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
}

/** Weighted findings of a scan, for the trend sparkline (critical counts most) */
export function weightedFindings(severity: SeverityCounts): number {
  return severity.critical * 10 + severity.high * 5 + severity.medium * 2 + severity.low;
}
