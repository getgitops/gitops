/**
 * Domain event payloads, shared by the server (bus, services, alert engine) and the client (alert
 * builder UI). Type-only: keep this file free of server imports.
 *
 * Rules (docs/adr/0001-event-bus-and-alerts.md): names are `<module>.<resource>.<action>` in
 * snake_case with a past participle, and payloads never contain secrets (vault values, invitation
 * or reset tokens/URLs, hashes, API keys).
 */

export type CodeReportVulnerabilityCounts = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
  total: number;
  /** Secrets detected by the scan (a count, never the matches). */
  secrets: number;
};

export type CodeReportEventGitInfo = {
  repositoryUrl: string | null;
  branch: string | null;
  commit: string | null;
  version: string | null;
};

export type CodeReportPolicyStatus = 'no_policies' | 'not_applicable' | 'compliant' | 'violated';

export type CodeReportAnalysisCompletedPayload = {
  analysisId: string;
  serviceId: string;
  tool: string;
  gitInfo: CodeReportEventGitInfo;
  /** Counts computed server-side from the stored result. */
  summary: CodeReportVulnerabilityCounts;
  policies: {
    status: CodeReportPolicyStatus;
    totalViolations: number;
    blockingFailures: number;
    failedPolicyIds: string[];
  };
};

export type CodeReportAnalysisFailedPayload = {
  analysisId: string;
  serviceId: string;
  tool: string;
  gitInfo: CodeReportEventGitInfo;
  error: string;
};

export type CodeReportPolicyViolatedPayload = {
  analysisId: string;
  serviceId: string;
  tool: string;
  policyId: string;
  policyName: string;
  policyType: string;
  enforcement: 'warn' | 'block';
  violations: number;
};

export type CodeReportServicePayload = {
  serviceId: string;
  name: string;
  slug: string;
};

export interface DomainEventMap {
  'code_report.analysis.completed': CodeReportAnalysisCompletedPayload;
  'code_report.analysis.failed': CodeReportAnalysisFailedPayload;
  'code_report.policy.violated': CodeReportPolicyViolatedPayload;
  'code_report.service.created': CodeReportServicePayload;
  'code_report.service.deleted': CodeReportServicePayload;
}

export type EventType = Extract<keyof DomainEventMap, string>;
