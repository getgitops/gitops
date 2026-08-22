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

export type VulnerabilityFinding = {
  id: string;
  packageName: string;
  installedVersion: string;
  fixedVersion: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  status: string;
  target: string;
  packagePath: string;
  packageIdentifier: string;
  lineStart: number | null;
  lineEnd: number | null;
  codeSnippet: string;
  title: string;
  description: string;
  primaryUrl: string;
  cveUrl: string;
  cvssScore: number | null;
  cweIds: string[];
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

export function extractVulnerabilities(result: unknown): VulnerabilityFinding[] {
  if (!result || typeof result !== 'object') return [];

  const results = (result as Record<string, unknown>).Results;
  if (!Array.isArray(results)) return [];

  return results.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const vulnerabilities = Array.isArray(row.Vulnerabilities) ? row.Vulnerabilities : [];

    return vulnerabilities.flatMap((vulnerability) => {
      if (!vulnerability || typeof vulnerability !== 'object') return [];
      const vuln = vulnerability as Record<string, unknown>;
      const severity = String(vuln.Severity || '').toLowerCase();
      const cvss = vuln.CVSS;
      const scores = cvss && typeof cvss === 'object' ? Object.values(cvss) : [];
      const score = scores.reduce<number | null>((highest, source) => {
        if (!source || typeof source !== 'object') return highest;
        const value = Number((source as Record<string, unknown>).V3Score);
        return Number.isFinite(value) && (highest === null || value > highest) ? value : highest;
      }, null);

      return [
        {
          id: String(vuln.VulnerabilityID || `${vuln.PkgName || 'unknown'}-${row.Target || ''}`),
          packageName: String(vuln.PkgName || 'Paquete desconocido'),
          installedVersion: String(vuln.InstalledVersion || 'desconocida'),
          fixedVersion: String(vuln.FixedVersion || ''),
          severity:
            severity === 'critical' ||
            severity === 'high' ||
            severity === 'medium' ||
            severity === 'low'
              ? severity
              : 'unknown',
          status: String(vuln.Status || 'unknown').toLowerCase(),
          target: String(row.Target || 'Target no especificado'),
          packagePath: String(vuln.PkgPath || row.Target || 'Ruta no especificada'),
          packageIdentifier: String(vuln.PkgIdentifier || ''),
          lineStart: Number.isFinite(Number(vuln.StartLine)) ? Number(vuln.StartLine) : null,
          lineEnd: Number.isFinite(Number(vuln.EndLine)) ? Number(vuln.EndLine) : null,
          codeSnippet: String(vuln.CodeSnippet || vuln.Snippet || ''),
          title: String(vuln.Title || 'Vulnerabilidad sin título'),
          description: String(vuln.Description || ''),
          primaryUrl: String(vuln.PrimaryURL || ''),
          cveUrl: `https://nvd.nist.gov/vuln/detail/${String(vuln.VulnerabilityID || '')}`,
          cvssScore: score,
          cweIds: Array.isArray(vuln.CweIDs) ? vuln.CweIDs.map(String) : [],
        },
      ];
    });
  });
}
