export const SECURITY_POLICY_TYPES = [
  'vulnerabilities',
  'license',
  'code_coverage',
  'secrets',
] as const;

export type SecurityPolicyType = (typeof SECURITY_POLICY_TYPES)[number];

export const SECURITY_POLICY_ENFORCEMENTS = ['warn', 'block'] as const;
export type SecurityPolicyEnforcement = (typeof SECURITY_POLICY_ENFORCEMENTS)[number];

export const SECURITY_POLICY_SCOPE_MODES = ['all', 'services', 'tags'] as const;
export type SecurityPolicyScopeMode = (typeof SECURITY_POLICY_SCOPE_MODES)[number];

export type SecurityPolicyScope = {
  mode: SecurityPolicyScopeMode;
  services: string[];
  tags: string[];
};

export type VulnerabilitiesRules = {
  maxCritical: number | null;
  maxHigh: number | null;
  maxMedium: number | null;
  maxLow: number | null;
  minCvssScore: number | null;
  ignoreUnfixed: boolean;
  maxAgeDays: number | null;
  ignoredCves: string[];
};

export type LicenseRules = {
  mode: 'allowlist' | 'denylist';
  licenses: string[];
  allowUnknown: boolean;
};

export type CodeCoverageRules = {
  minTotalCoverage: number | null;
  minPatchCoverage: number | null;
  allowCoverageDrop: boolean;
};

export type SecretsRules = {
  maxSecrets: number | null;
  blockVerifiedOnly: boolean;
  ignoredRules: string[];
};

export type SecurityPolicyRules =
  | VulnerabilitiesRules
  | LicenseRules
  | CodeCoverageRules
  | SecretsRules
  | Record<string, unknown>;

export type SecurityPolicy = {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  description: string | null;
  type: SecurityPolicyType;
  enabled: boolean;
  enforcement: SecurityPolicyEnforcement;
  scope: SecurityPolicyScope;
  rules: SecurityPolicyRules;
  createdAt: string;
  updatedAt: string;
};

export const SECURITY_POLICY_TYPE_META: Record<
  SecurityPolicyType,
  { label: string; description: string; available: boolean }
> = {
  vulnerabilities: {
    label: 'Vulnerabilidades',
    description: 'Umbrales por severidad, CVSS y CVEs ignorados.',
    available: true,
  },
  license: {
    label: 'Licencias',
    description: 'Licencias permitidas o denegadas en las dependencias.',
    available: false,
  },
  code_coverage: {
    label: 'Cobertura de código',
    description: 'Mínimos de cobertura total y de los cambios.',
    available: false,
  },
  secrets: {
    label: 'Secretos',
    description: 'Secretos expuestos detectados en el repositorio.',
    available: false,
  },
};

export const SECURITY_POLICY_ENFORCEMENT_META: Record<
  SecurityPolicyEnforcement,
  { label: string; description: string; available: boolean }
> = {
  warn: {
    label: 'Avisar',
    description: 'Marca el análisis como incumplido pero no bloquea el pipeline.',
    available: true,
  },
  block: {
    label: 'Bloquear',
    description: 'Falla el pipeline cuando el análisis incumple la política.',
    available: false,
  },
};

export function defaultRulesFor(type: SecurityPolicyType): SecurityPolicyRules {
  switch (type) {
    case 'vulnerabilities':
      return {
        maxCritical: 0,
        maxHigh: null,
        maxMedium: null,
        maxLow: null,
        minCvssScore: null,
        ignoreUnfixed: false,
        maxAgeDays: null,
        ignoredCves: [],
      } satisfies VulnerabilitiesRules;
    case 'license':
      return { mode: 'denylist', licenses: [], allowUnknown: true } satisfies LicenseRules;
    case 'code_coverage':
      return {
        minTotalCoverage: 80,
        minPatchCoverage: null,
        allowCoverageDrop: false,
      } satisfies CodeCoverageRules;
    case 'secrets':
      return {
        maxSecrets: 0,
        blockVerifiedOnly: false,
        ignoredRules: [],
      } satisfies SecretsRules;
  }
}

export function defaultScope(): SecurityPolicyScope {
  return { mode: 'all', services: [], tags: [] };
}

export function isSecurityPolicyType(value: unknown): value is SecurityPolicyType {
  return SECURITY_POLICY_TYPES.includes(value as SecurityPolicyType);
}

export function describeScope(scope: SecurityPolicyScope): string {
  if (scope.mode === 'services') {
    return scope.services.length > 0
      ? `${scope.services.length} servicio(s)`
      : 'Sin servicios seleccionados';
  }
  if (scope.mode === 'tags') {
    return scope.tags.length > 0 ? scope.tags.join(', ') : 'Sin tags seleccionados';
  }
  return 'Todos los servicios';
}
