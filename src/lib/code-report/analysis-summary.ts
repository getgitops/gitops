// Best-effort summary for Trivy-style JSON reports (top-level `Results[]`, each entry may
// carry `Vulnerabilities`/`Secrets`/`Packages`). Other tool formats simply yield all-zero counts.
export type AnalysisSummary = {
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
  };
  totalVulnerabilities: number;
  exposedSecrets: number;
  dependencies: number;
  targetsScanned: number;
};

function emptySummary(): AnalysisSummary {
  return {
    vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
    totalVulnerabilities: 0,
    exposedSecrets: 0,
    dependencies: 0,
    targetsScanned: 0,
  };
}

export function summarizeAnalysisResult(result: unknown): AnalysisSummary {
  const summary = emptySummary();

  if (!result || typeof result !== 'object') return summary;

  const results = (result as Record<string, unknown>).Results;
  if (!Array.isArray(results)) return summary;

  const packageNames = new Set<string>();
  summary.targetsScanned = results.length;

  for (const entry of results) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;

    const vulnerabilities = Array.isArray(row.Vulnerabilities) ? row.Vulnerabilities : [];
    for (const vuln of vulnerabilities) {
      if (!vuln || typeof vuln !== 'object') continue;
      const vulnRow = vuln as Record<string, unknown>;
      summary.totalVulnerabilities += 1;

      const severity = String(vulnRow.Severity || '').toLowerCase();
      if (severity === 'critical') summary.vulnerabilities.critical += 1;
      else if (severity === 'high') summary.vulnerabilities.high += 1;
      else if (severity === 'medium') summary.vulnerabilities.medium += 1;
      else if (severity === 'low') summary.vulnerabilities.low += 1;
      else summary.vulnerabilities.unknown += 1;

      if (vulnRow.PkgName) packageNames.add(String(vulnRow.PkgName));
    }

    const secrets = Array.isArray(row.Secrets) ? row.Secrets : [];
    summary.exposedSecrets += secrets.length;

    const packages = Array.isArray(row.Packages) ? row.Packages : [];
    for (const pkg of packages) {
      if (pkg && typeof pkg === 'object' && (pkg as Record<string, unknown>).Name) {
        packageNames.add(String((pkg as Record<string, unknown>).Name));
      }
    }
  }

  summary.dependencies = packageNames.size;

  return summary;
}
