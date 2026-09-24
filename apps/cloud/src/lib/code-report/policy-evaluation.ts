import type { SecretFinding, VulnerabilityFinding } from './analysis-summary';
import type {
  SecurityPolicy,
  SecurityPolicyType,
  VulnerabilitiesRules,
} from './security-policy';

export type PolicyCheck = {
  key: string;
  label: string;
  actual: number;
  limit: number | null;
  passed: boolean;
  message: string;
  samples: string[];
};

export type PolicyEvaluation = {
  policyId: string;
  policyName: string;
  policySlug: string;
  type: SecurityPolicyType;
  enforcement: SecurityPolicy['enforcement'];
  applies: boolean;
  evaluable: boolean;
  skippedReason: string | null;
  passed: boolean;
  checks: PolicyCheck[];
  violations: PolicyCheck[];
};

export type PolicyComplianceReport = {
  status: 'no_policies' | 'not_applicable' | 'compliant' | 'violated';
  evaluations: PolicyEvaluation[];
  passed: PolicyEvaluation[];
  failed: PolicyEvaluation[];
  totalViolations: number;
  blockingFailures: number;
};

export type PolicyEvaluationContext = {
  serviceId: string;
  serviceTags: string[];
  vulnerabilities: VulnerabilityFinding[];
  secrets: SecretFinding[];
  hasVulnerabilityScan: boolean;
  hasSecretScan: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function policyApplies(policy: SecurityPolicy, context: PolicyEvaluationContext): boolean {
  if (policy.scope.mode === 'services') return policy.scope.services.includes(context.serviceId);
  if (policy.scope.mode === 'tags')
    return policy.scope.tags.some((tag) => context.serviceTags.includes(tag));
  return true;
}

function check(
  key: string,
  label: string,
  actual: number,
  limit: number | null,
  samples: string[],
  message: string,
): PolicyCheck {
  return {
    key,
    label,
    actual,
    limit,
    passed: limit === null || actual <= limit,
    message,
    samples: samples.slice(0, 5),
  };
}

function relevantVulnerabilities(rules: VulnerabilitiesRules, findings: VulnerabilityFinding[]) {
  const ignored = new Set(rules.ignoredCves.map((cve) => cve.toUpperCase()));
  return findings.filter((finding) => {
    if (ignored.has(finding.id.toUpperCase())) return false;
    if (rules.ignoreUnfixed && !finding.fixedVersion) return false;
    if (rules.minCvssScore !== null && (finding.cvssScore ?? 0) < rules.minCvssScore) return false;
    return true;
  });
}

function evaluateVulnerabilities(
  rules: VulnerabilitiesRules,
  findings: VulnerabilityFinding[],
): PolicyCheck[] {
  const scoped = relevantVulnerabilities(rules, findings);
  const bySeverity = (severity: VulnerabilityFinding['severity']) =>
    scoped.filter((finding) => finding.severity === severity);

  const severityChecks: { key: keyof VulnerabilitiesRules; label: string; severity: VulnerabilityFinding['severity'] }[] =
    [
      { key: 'maxCritical', label: 'Vulnerabilidades críticas', severity: 'critical' },
      { key: 'maxHigh', label: 'Vulnerabilidades altas', severity: 'high' },
      { key: 'maxMedium', label: 'Vulnerabilidades medias', severity: 'medium' },
      { key: 'maxLow', label: 'Vulnerabilidades bajas', severity: 'low' },
    ];

  const checks = severityChecks
    .filter(({ key }) => rules[key] !== null && rules[key] !== undefined)
    .map(({ key, label, severity }) => {
      const matches = bySeverity(severity);
      const limit = rules[key] as number;
      return check(
        String(key),
        label,
        matches.length,
        limit,
        matches.map((finding) => finding.id),
        `${matches.length} encontradas · máximo permitido ${limit}`,
      );
    });

  if (rules.maxAgeDays !== null) {
    const cutoff = Date.now() - rules.maxAgeDays * DAY_MS;
    const stale = scoped.filter((finding) => {
      if (!finding.publishedDate) return false;
      const published = new Date(finding.publishedDate).getTime();
      return Number.isFinite(published) && published < cutoff;
    });
    checks.push(
      check(
        'maxAgeDays',
        `Hallazgos con más de ${rules.maxAgeDays} días`,
        stale.length,
        0,
        stale.map((finding) => finding.id),
        `${stale.length} vulnerabilidades publicadas hace más de ${rules.maxAgeDays} días`,
      ),
    );
  }

  return checks;
}

function evaluateSecrets(rules: any, secrets: SecretFinding[]): PolicyCheck[] {
  const ignored = new Set<string>((rules.ignoredRules ?? []).map((rule: string) => rule.toLowerCase()));
  const scoped = secrets.filter((secret) => !ignored.has(secret.ruleId.toLowerCase()));

  if (rules.maxSecrets === null || rules.maxSecrets === undefined) return [];

  return [
    check(
      'maxSecrets',
      'Secretos expuestos',
      scoped.length,
      rules.maxSecrets,
      scoped.map((secret) => `${secret.ruleId} · ${secret.file}`),
      `${scoped.length} secretos detectados · máximo permitido ${rules.maxSecrets}`,
    ),
  ];
}

export function evaluatePolicy(
  policy: SecurityPolicy,
  context: PolicyEvaluationContext,
): PolicyEvaluation {
  const base = {
    policyId: policy.id,
    policyName: policy.name,
    policySlug: policy.slug,
    type: policy.type,
    enforcement: policy.enforcement,
    applies: policyApplies(policy, context),
  };

  const notEvaluable = (reason: string): PolicyEvaluation => ({
    ...base,
    evaluable: false,
    skippedReason: reason,
    passed: true,
    checks: [],
    violations: [],
  });

  if (!base.applies) return notEvaluable('Fuera del alcance de este servicio');

  let checks: PolicyCheck[];

  if (policy.type === 'vulnerabilities') {
    if (!context.hasVulnerabilityScan) return notEvaluable('Sin análisis de vulnerabilidades');
    checks = evaluateVulnerabilities(policy.rules as VulnerabilitiesRules, context.vulnerabilities);
  } else if (policy.type === 'secrets') {
    if (!context.hasSecretScan) return notEvaluable('Sin análisis de secretos');
    checks = evaluateSecrets(policy.rules, context.secrets);
  } else {
    return notEvaluable('Tipo de política todavía no evaluable');
  }

  if (checks.length === 0) return notEvaluable('La política no define reglas aplicables');

  const violations = checks.filter((item) => !item.passed);

  return {
    ...base,
    evaluable: true,
    skippedReason: null,
    passed: violations.length === 0,
    checks,
    violations,
  };
}

export function evaluatePolicies(
  policies: SecurityPolicy[],
  context: PolicyEvaluationContext,
): PolicyComplianceReport {
  const active = policies.filter((policy) => policy.enabled);
  const evaluations = active.map((policy) => evaluatePolicy(policy, context));
  const evaluable = evaluations.filter((evaluation) => evaluation.evaluable);
  const failed = evaluable.filter((evaluation) => !evaluation.passed);
  const passed = evaluable.filter((evaluation) => evaluation.passed);

  const status: PolicyComplianceReport['status'] =
    active.length === 0
      ? 'no_policies'
      : evaluable.length === 0
        ? 'not_applicable'
        : failed.length > 0
          ? 'violated'
          : 'compliant';

  return {
    status,
    evaluations,
    passed,
    failed,
    totalViolations: failed.reduce((total, evaluation) => total + evaluation.violations.length, 0),
    blockingFailures: failed.filter((evaluation) => evaluation.enforcement === 'block').length,
  };
}

// each tool stores its own partial report, so views combine them into a single one
export function mergeComplianceReports(
  reports: (PolicyComplianceReport | null | undefined)[],
): PolicyComplianceReport | null {
  const available = reports.filter((report): report is PolicyComplianceReport => Boolean(report));
  if (available.length === 0) return null;

  const byPolicy = new Map<string, PolicyEvaluation>();
  for (const report of available) {
    for (const evaluation of report.evaluations) {
      const existing = byPolicy.get(evaluation.policyId);
      // an evaluable result always wins over a skipped one
      if (!existing || (!existing.evaluable && evaluation.evaluable)) {
        byPolicy.set(evaluation.policyId, evaluation);
      }
    }
  }

  const evaluations = [...byPolicy.values()];
  const evaluable = evaluations.filter((evaluation) => evaluation.evaluable);
  const failed = evaluable.filter((evaluation) => !evaluation.passed);
  const passed = evaluable.filter((evaluation) => evaluation.passed);

  return {
    status:
      evaluations.length === 0
        ? 'no_policies'
        : evaluable.length === 0
          ? 'not_applicable'
          : failed.length > 0
            ? 'violated'
            : 'compliant',
    evaluations,
    passed,
    failed,
    totalViolations: failed.reduce((total, evaluation) => total + evaluation.violations.length, 0),
    blockingFailures: failed.filter((evaluation) => evaluation.enforcement === 'block').length,
  };
}
