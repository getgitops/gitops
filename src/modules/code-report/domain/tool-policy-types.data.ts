import type { SecurityPolicyType } from '$lib/code-report/security-policy';

// each tool only produces evidence for some policy types
export const TOOL_POLICY_TYPES: Record<string, SecurityPolicyType[]> = {
  trivy: ['vulnerabilities', 'license'],
  grype: ['vulnerabilities'],
  sbom: ['license'],
  syft: ['license'],
  gitleaks: ['secrets'],
  trufflehog: ['secrets'],
  coverage: ['code_coverage'],
  'code-coverage': ['code_coverage'],
};

export const DEFAULT_POLICY_TYPES: SecurityPolicyType[] = ['vulnerabilities', 'license'];
