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
  references: string[];
  epssScore: number | null;
  epssPercentile: number | null;
  publishedDate: string | null;
  lastModifiedDate: string | null;
};

export type SecretFinding = {
  id: string;
  ruleId: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  file: string;
  lineStart: number | null;
  lineEnd: number | null;
  match: string;
  author: string;
  commit: string;
  date: string;
  entropy: number | null;
};

export type SbomComponent = {
  name: string;
  version: string;
  type: string;
  purl: string;
  licenses: string[];
  locations: string[];
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

      const epss = vuln.EPSS;
      const epssScore =
        epss && typeof epss === 'object' && Number.isFinite(Number((epss as Record<string, unknown>).Score))
          ? Number((epss as Record<string, unknown>).Score)
          : null;
      const epssPercentile =
        epss &&
        typeof epss === 'object' &&
        Number.isFinite(Number((epss as Record<string, unknown>).Percentile))
          ? Number((epss as Record<string, unknown>).Percentile)
          : null;

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
          references: Array.isArray(vuln.References) ? vuln.References.map(String) : [],
          epssScore,
          epssPercentile,
          publishedDate: vuln.PublishedDate ? String(vuln.PublishedDate) : null,
          lastModifiedDate: vuln.LastModifiedDate ? String(vuln.LastModifiedDate) : null,
        },
      ];
    });
  });
}

// never surface the raw credential in the UI, only enough context to locate it
function maskSecret(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 12) return '•'.repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}${'•'.repeat(8)}${trimmed.slice(-4)}`;
}

function normalizeSeverity(value: unknown): SecretFinding['severity'] {
  const severity = String(value || '').toLowerCase();
  return severity === 'critical' ||
    severity === 'high' ||
    severity === 'medium' ||
    severity === 'low'
    ? severity
    : 'unknown';
}

// Accepts gitleaks report JSON (top-level array of findings) and Trivy `Results[].Secrets[]`.
export function extractSecrets(result: unknown): SecretFinding[] {
  if (!result) return [];

  if (Array.isArray(result)) {
    return result.flatMap((entry, index) => {
      if (!entry || typeof entry !== 'object') return [];
      const row = entry as Record<string, unknown>;
      const start = Number(row.StartLine);
      const end = Number(row.EndLine);
      return [
        {
          id: String(row.Fingerprint || `${row.RuleID || 'secret'}-${index}`),
          ruleId: String(row.RuleID || 'unknown-rule'),
          title: String(row.Description || row.RuleID || 'Secreto detectado'),
          severity: 'high' as const,
          file: String(row.File || 'Archivo no especificado'),
          lineStart: Number.isFinite(start) ? start : null,
          lineEnd: Number.isFinite(end) ? end : null,
          match: maskSecret(String(row.Match || row.Secret || '')),
          author: String(row.Author || ''),
          commit: String(row.Commit || ''),
          date: String(row.Date || ''),
          entropy: Number.isFinite(Number(row.Entropy)) ? Number(row.Entropy) : null,
        },
      ];
    });
  }

  if (typeof result !== 'object') return [];
  const results = (result as Record<string, unknown>).Results;
  if (!Array.isArray(results)) return [];

  return results.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const secrets = Array.isArray(row.Secrets) ? row.Secrets : [];

    return secrets.flatMap((secret, index) => {
      if (!secret || typeof secret !== 'object') return [];
      const item = secret as Record<string, unknown>;
      const start = Number(item.StartLine);
      const end = Number(item.EndLine);
      return [
        {
          id: `${String(item.RuleID || 'secret')}-${String(row.Target || '')}-${index}`,
          ruleId: String(item.RuleID || 'unknown-rule'),
          title: String(item.Title || item.Category || 'Secreto detectado'),
          severity: normalizeSeverity(item.Severity),
          file: String(item.Target || row.Target || 'Archivo no especificado'),
          lineStart: Number.isFinite(start) ? start : null,
          lineEnd: Number.isFinite(end) ? end : null,
          match: maskSecret(String(item.Match || '')),
          author: '',
          commit: '',
          date: '',
          entropy: null,
        },
      ];
    });
  });
}

// Accepts CycloneDX JSON (`components[]`) and native syft-json (`artifacts[]`).
export function extractSbomComponents(result: unknown): SbomComponent[] {
  if (!result || typeof result !== 'object') return [];
  const root = result as Record<string, unknown>;
  const entries = Array.isArray(root.components)
    ? root.components
    : Array.isArray(root.artifacts)
      ? root.artifacts
      : [];

  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;

    const licenses = Array.isArray(row.licenses)
      ? row.licenses.flatMap((license) => {
          if (typeof license === 'string') return [license];
          if (!license || typeof license !== 'object') return [];
          const item = license as Record<string, any>;
          const value = item.license?.id || item.license?.name || item.value || item.spdxExpression;
          return value ? [String(value)] : [];
        })
      : [];

    const locations = Array.isArray(row.locations)
      ? row.locations.flatMap((location) => {
          if (typeof location === 'string') return [location];
          if (!location || typeof location !== 'object') return [];
          const path = (location as Record<string, unknown>).path;
          return path ? [String(path)] : [];
        })
      : [];
    const properties = Array.isArray(row.properties) ? row.properties : [];
    const propertyValue = (name: string) => {
      const property = properties.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).name === name,
      ) as Record<string, unknown> | undefined;
      return property?.value ? String(property.value) : '';
    };
    const type = propertyValue('syft:package:type') || propertyValue('syft:package:language') || row.type;

    return [
      {
        name: String(row.name || 'Componente sin nombre'),
        version: String(row.version || 'desconocida'),
        type: String(type || 'unknown'),
        purl: String(row.purl || ''),
        licenses: [...new Set(licenses)],
        locations,
      },
    ];
  });
}
