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

export type VaultSecretChangedField = 'key' | 'description' | 'folder' | 'values';

/** Never carries secret values: only which environments hold (or changed) a value. */
export type VaultSecretPayload = {
  secretId: string;
  key: string;
  folderId: string | null;
  /** `/` for the vault root. */
  folderPath: string;
  /** Environments with a value (created/deleted) or whose value changed (updated). */
  environmentIds: string[];
};

export type VaultSecretUpdatedPayload = VaultSecretPayload & {
  changedFields: VaultSecretChangedField[];
};

export type VaultEnvImportedPayload = {
  environmentId: string;
  environmentSlug: string;
  folderId: string | null;
  folderPath: string;
  created: number;
  updated: number;
};

export type VaultEnvironmentPayload = {
  environmentId: string;
  name: string;
  slug: string;
};

export type ProjectChangedField =
  'name' | 'slug' | 'description' | 'status' | 'modules' | 'organization' | 'settings';

export type ProjectPayload = {
  projectId: string;
  name: string;
  slug: string;
};

export type FieldChange<F extends string = string> = {
  field: F;
  before: string | null;
  after: string | null;
};

export type ProjectUpdatedPayload = ProjectPayload & {
  changedFields: ProjectChangedField[];
  changes?: FieldChange<ProjectChangedField>[];
};

export type OrganizationChangedField = 'name' | 'slug' | 'description';

export type OrganizationUpdatedPayload = {
  organizationId: string;
  name: string;
  slug: string;
  changedFields: OrganizationChangedField[];
  changes?: FieldChange<OrganizationChangedField>[];
};

export type AccessScope = 'cluster' | 'organization' | 'project';

export type AccessStatus = 'active' | 'invited';

/** A role assignment: a cluster account role, or a membership in an organization or project. */
export type AccessPayload = {
  /** The user-access entry id (the user id for cluster-level access). */
  accessId: string;
  userId: string;
  roleId: string | null;
  scope: AccessScope;
  status: AccessStatus;
};

export type AccessUpdatedPayload = AccessPayload & {
  previousRoleId: string | null;
  previousStatus: AccessStatus;
};

/** Never carries the invitation token, its URL or the invitee's email. */
export type UserInvitedPayload = {
  userId: string;
  roleId: string;
  organizationId: string;
};

export type InvitationAcceptedPayload = {
  userId: string;
  accessId: string;
  roleId: string | null;
  scope: AccessScope;
};

export type RoleUpdatedPayload = {
  roleId: string;
  name: string;
  scope: AccessScope;
  nameChanged: boolean;
  addedPermissions: string[];
  removedPermissions: string[];
};

/** Never carries the key or its hash: `keyPrefix` is the public, non-secret identifier. */
export type ApiKeyPayload = {
  apiKeyId: string;
  name: string;
  keyPrefix: string;
  projectId: string | null;
  userId: string | null;
};

export type MonitoringMonitorStatus = 'up' | 'down' | 'degraded';

/**
 * A monitor changed status. `url` is the display URL: no credentials, no query string (it may carry
 * tokens). Header values and the body never leave the monitoring module.
 */
export type MonitoringMonitorStatusPayload = {
  monitorId: string;
  name: string;
  url: string;
  /** Code Report service the monitor belongs to, if any. */
  serviceId: string | null;
  status: MonitoringMonitorStatus;
  previousStatus: string;
  incidentId: string;
  /** `timeout`, `dns`, `connection`, `tls`, `unexpected_status`, `slow_response`… */
  cause: string | null;
  httpStatus: number | null;
  error: string | null;
  /** How long the incident lasted (`recovered` only). */
  durationSeconds: number | null;
};

/**
 * A notification channel disabled itself after too many delivery failures in a row. Never carries
 * the destination nor any secret: `lastError` is the short reason (`HTTP 410`, `timeout`).
 */
export type NotificationChannelDisabledPayload = {
  channelId: string;
  name: string;
  /** `webhook`, `slack`, `google-chat` */
  type: string;
  reason: 'failures';
  failures: number;
  lastError: string;
  createdByUserId: string;
};

export type StateIacBackendChangedField =
  'name' | 'bucket' | 'prefix' | 'region' | 'endpoint' | 'auth' | 'credentials' | 'enabled';

/** A State IaC backend (bucket) of an organization. Never carries its credentials. */
export type StateIacBackendPayload = {
  backendId: string;
  name: string;
  engine: string;
  provider: string;
  bucket: string;
  prefix: string | null;
};

export type StateIacBackendUpdatedPayload = StateIacBackendPayload & {
  /** `credentials` only says they were replaced or removed, never their value. */
  changedFields: StateIacBackendChangedField[];
};

/** A Pulumi project assigned to a GitOps project, reassigned, or unassigned (`projectId: null`). */
export type StateIacBindingUpdatedPayload = {
  backendId: string;
  backendName: string;
  pulumiProject: string;
  projectId: string | null;
  previousProjectId: string | null;
  /** Assigned stacks; empty = all of them. */
  stacks: string[];
};

export type CveFeedSeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

/**
 * A CVE of the public feeds (OSV, CISA KEV…) for a technology the organization follows. `url` is
 * the absolute link to the advisory in the app (a path when `ORIGIN` is not set).
 */
export type CveFeedAdvisoryPayload = {
  cveId: string;
  aliases: string[];
  title: string;
  severity: CveFeedSeverity;
  cvssScore: number | null;
  epssScore: number | null;
  kev: boolean;
  technologyId: string;
  /** `null` for software looked up by CPE */
  ecosystem: string | null;
  package: string | null;
  fixedVersions: string[];
  sources: string[];
  url: string;
};

/** The advisory of a followed technology also shows up in a scan of one of the projects. */
export type CveFeedAffectsProjectPayload = CveFeedAdvisoryPayload & {
  projectId: string;
  serviceIds: string[];
};

export interface DomainEventMap {
  'code_report.analysis.completed': CodeReportAnalysisCompletedPayload;
  'code_report.analysis.failed': CodeReportAnalysisFailedPayload;
  'code_report.policy.violated': CodeReportPolicyViolatedPayload;
  'code_report.service.created': CodeReportServicePayload;
  'code_report.service.deleted': CodeReportServicePayload;
  'vault.secret.created': VaultSecretPayload;
  'vault.secret.updated': VaultSecretUpdatedPayload;
  'vault.secret.deleted': VaultSecretPayload;
  'vault.env.imported': VaultEnvImportedPayload;
  'vault.environment.created': VaultEnvironmentPayload;
  'vault.environment.deleted': VaultEnvironmentPayload;
  'project.created': ProjectPayload;
  'project.updated': ProjectUpdatedPayload;
  'project.deleted': ProjectPayload;
  'organization.updated': OrganizationUpdatedPayload;
  'access.granted': AccessPayload;
  'access.updated': AccessUpdatedPayload;
  'access.revoked': AccessPayload;
  'user.invited': UserInvitedPayload;
  'invitation.accepted': InvitationAcceptedPayload;
  'role.updated': RoleUpdatedPayload;
  'api_key.created': ApiKeyPayload;
  'api_key.revoked': ApiKeyPayload;
  'monitoring.monitor.down': MonitoringMonitorStatusPayload;
  'monitoring.monitor.degraded': MonitoringMonitorStatusPayload;
  'monitoring.monitor.recovered': MonitoringMonitorStatusPayload;
  'notifications.channel.disabled': NotificationChannelDisabledPayload;
  'state_iac.backend.created': StateIacBackendPayload;
  'state_iac.backend.updated': StateIacBackendUpdatedPayload;
  'state_iac.backend.deleted': StateIacBackendPayload;
  'state_iac.binding.updated': StateIacBindingUpdatedPayload;
  'cve_feed.advisory.published': CveFeedAdvisoryPayload;
  'cve_feed.advisory.escalated': CveFeedAdvisoryPayload;
  'cve_feed.advisory.fix_available': CveFeedAdvisoryPayload;
  'cve_feed.advisory.affects_project': CveFeedAffectsProjectPayload;
}

export type EventType = Extract<keyof DomainEventMap, string>;
