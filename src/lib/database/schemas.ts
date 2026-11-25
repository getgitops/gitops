import {
  bool,
  defineRelations,
  entity,
  integer,
  json,
  text,
  timestamp,
  uuid,
} from '@getgitops/gitdb';

export const UserEntity = entity('users', {
  id: uuid().primaryKey(),
  username: text().notNull(),
  email: text(),
  passwordHash: text().notNull(),
  roleId: uuid().notNull(),
  status: text().notNull().default('active'),
  invitationTokenHash: text(),
  invitationExpiresAt: timestamp(),
  passwordResetTokenHash: text(),
  passwordResetExpiresAt: timestamp(),
  authProviders: json()
    .notNull()
    .$defaultFn(() => []),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  lastLoginAt: timestamp(),
  disabled: bool().notNull().default(false),
});

export const RoleEntity = entity('roles', {
  id: uuid().primaryKey(),
  slug: text().notNull(),
  name: text().notNull(),
  scope: text().notNull().default('cluster'),
  organizationId: uuid().$defaultFn(() => null),
  projectId: uuid().$defaultFn(() => null),
  permissions: json()
    .notNull()
    .$defaultFn(() => []),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// exactly one of `userId` (personal key) or `projectId` (machine-to-machine project key) is set;
// `roleId` is only meaningful for project keys and points to a project-scoped role
export const ApiKeyEntity = entity('api_keys', {
  id: uuid().primaryKey(),
  userId: uuid().notNull(),
  projectId: uuid().$defaultFn(() => null),
  roleId: uuid(),
  createdByUserId: uuid(),
  name: text().notNull(),
  keyPrefix: text().notNull(),
  keyHash: text().notNull(),
  expiresAt: timestamp(),
  lastUsedAt: timestamp(),
  revokedAt: timestamp(),
  /** Última vez que se regeneró el secreto de la clave; null si nunca se ha rotado. */
  rotatedAt: timestamp(),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const UserAccessEntity = entity('user_access', {
  id: uuid().primaryKey(),
  userId: uuid().notNull(),
  roleId: uuid().notNull(),
  scope: text().notNull(),
  organizationId: uuid().$defaultFn(() => null),
  projectId: uuid().$defaultFn(() => null),
  status: text().notNull().default('active'),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// singleton row (fixed id), holds cluster-wide feature toggles such as self-service registration
export const ClusterSettingsEntity = entity('cluster_settings', {
  id: uuid().primaryKey(),
  registrationEnabled: bool().notNull().default(false),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const relations = defineRelations();

relations.for(UserEntity, ({ one, many }) => ({
  role: one(RoleEntity, { fields: ['roleId'], references: ['id'] }),
  apiKeys: many(ApiKeyEntity, { fields: ['id'], references: ['userId'] }),
  access: many(UserAccessEntity, { fields: ['id'], references: ['userId'] }),
}));

relations.for(ApiKeyEntity, ({ one }) => ({
  user: one(UserEntity, { fields: ['userId'], references: ['id'] }),
}));

export const OrganizationEntity = entity('organizations', {
  id: uuid().primaryKey(),
  slug: text().notNull(),
  name: text().notNull(),
  description: text(),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const ProjectEntity = entity('projects', {
  id: uuid().primaryKey(),
  organizationId: uuid().notNull(),
  slug: text().notNull(),
  name: text().notNull(),
  description: text(),
  status: text().notNull().default('active'),
  modules: json()
    .notNull()
    .$defaultFn(() => ({ vault: true, codereport: true, stateiac: true })),
  settings: json()
    .notNull()
    .$defaultFn(() => ({ 'code-report': {} })),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const CodeReportServiceEntity = entity('code_report_services', {
  id: uuid().primaryKey(),
  projectId: uuid().notNull(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  tags: json()
    .notNull()
    .$defaultFn(() => []),
  tools: json()
    .notNull()
    .$defaultFn(() => ['trivy']),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const CodeReportAnalysisEntity = entity('code_report_analyses', {
  id: uuid().primaryKey(),
  serviceId: uuid().notNull(),
  tool: text().notNull(),
  status: text().notNull().default('in_progress'),
  result: json(),
  summary: json(),
  // compliance report evaluated when the analysis is completed
  securityPolicies: json(),
  error: text(),
  gitInfo: json(),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const CodeReportSecurityPolicyEntity = entity('code_report_security_policies', {
  id: uuid().primaryKey(),
  projectId: uuid().notNull(),
  slug: text().notNull(),
  name: text().notNull(),
  description: text(),
  // vulnerabilities | license | code_coverage | secrets
  type: text().notNull().default('vulnerabilities'),
  enabled: bool().notNull().default(true),
  // warn | block
  enforcement: text().notNull().default('warn'),
  // { mode: 'all' | 'services' | 'tags', services: string[], tags: string[] }
  scope: json()
    .notNull()
    .$defaultFn(() => ({ mode: 'all', services: [], tags: [] })),
  // type-specific configuration, see #lib/code-report/security-policy
  rules: json()
    .notNull()
    .$defaultFn(() => ({})),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// HTTP monitor configuration (main GitDB: rarely written, audited). `secrets` is the encrypted
// JSON of the header values and the body (`#modules/monitoring` crypto); `headerNames` lists the
// header names only, so the UI can show them without decrypting anything
export const MonitorEntity = entity('monitors', {
  id: uuid().primaryKey(),
  projectId: uuid().notNull(),
  // optional code_report_services row of the same project the monitor checks
  serviceId: uuid().$defaultFn(() => null),
  name: text().notNull(),
  url: text().notNull(),
  method: text().notNull().default('GET'),
  headerNames: json()
    .notNull()
    .$defaultFn(() => []),
  secrets: text(),
  intervalSeconds: integer().notNull().default(60),
  timeoutMs: integer().notNull().default(10000),
  expectedStatus: text().notNull().default('200-299'),
  degradedThresholdMs: integer().notNull().default(2000),
  // consecutive failing checks before the monitor is reported down/degraded
  confirmations: integer().notNull().default(2),
  followRedirects: bool().notNull().default(true),
  enabled: bool().notNull().default(true),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Monitoring metrics (`monitoring_*`): written by the monitoring runtime to
// MONITORING_GITDB_REPOSITORY_URL, or to the main repository when it is not set. Never one row
// per check: incidents on every status change, hourly aggregates, and one row per day once an hour
// is older than the retention window. The audit views skip these tables.

// a period a monitor was down or degraded; `endedAt` null while it is still open
export const MonitoringIncidentEntity = entity('monitoring_incidents', {
  id: uuid().primaryKey(),
  monitorId: uuid().notNull(),
  projectId: uuid().notNull(),
  status: text().notNull(),
  cause: text(),
  httpStatus: integer(),
  error: text(),
  startedAt: timestamp().notNull(),
  endedAt: timestamp(),
  failedChecks: integer().notNull().default(0),
});

const aggregateColumns = () => ({
  monitorId: uuid().notNull(),
  projectId: uuid().notNull(),
  total: integer().notNull().default(0),
  up: integer().notNull().default(0),
  degraded: integer().notNull().default(0),
  down: integer().notNull().default(0),
  latencyAvg: integer(),
  latencyP95: integer(),
  latencyMax: integer(),
});

// one row per monitor and closed hour (`hour`: ISO start of the hour, UTC)
export const MonitoringHourlyEntity = entity('monitoring_hourly', {
  id: text().primaryKey(),
  hour: timestamp().notNull(),
  ...aggregateColumns(),
});

// the hour in progress, one row per monitor, rewritten on every flush (MONITORING_FLUSH_SECONDS);
// `latencies` keeps the samples so the p95 survives a restart
export const MonitoringCurrentEntity = entity('monitoring_current', {
  id: uuid().primaryKey(),
  hour: timestamp().notNull(),
  latencies: json()
    .notNull()
    .$defaultFn(() => []),
  lastCheck: json(),
  ...aggregateColumns(),
});

// one row per monitor and day (`day`: YYYY-MM-DD, UTC), compacted from hours past the retention
export const MonitoringDailyEntity = entity('monitoring_daily', {
  id: text().primaryKey(),
  day: text().notNull(),
  ...aggregateColumns(),
});

export const VaultEnvironmentEntity = entity('vault_environments', {
  id: uuid().primaryKey(),
  projectId: uuid().notNull(),
  slug: text().notNull(),
  name: text().notNull(),
  description: text(),
  order: integer()
    .notNull()
    .$defaultFn(() => 0),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const VaultFolderEntity = entity('vault_folders', {
  id: uuid().primaryKey(),
  projectId: uuid().notNull(),
  parentFolderId: uuid().$defaultFn(() => null),
  linkedFolderId: uuid().$defaultFn(() => null),
  name: text().notNull(),
  path: text().notNull(),
  description: text(),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const VaultSecretEntity = entity('vault_secrets', {
  id: uuid().primaryKey(),
  projectId: uuid().notNull(),
  folderId: uuid().$defaultFn(() => null),
  key: text().notNull(),
  description: text(),
  values: json()
    .notNull()
    .$defaultFn(() => ({})),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const VaultSettingsEntity = entity('vault_settings', {
  id: uuid().primaryKey(),
  projectId: uuid().notNull(),
  capitalizeSecrets: bool()
    .notNull()
    .$defaultFn(() => true),
  encryptionProvider: text()
    .notNull()
    .$defaultFn(() => 'gitops_kms'),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// alert on one event type (#79): `projectId` is null for organization alerts, which cover every
// project of the organization; `conditions` filter on catalog fields (`#lib/events/catalog`)
export const AlertEntity = entity('alerts', {
  id: uuid().primaryKey(),
  name: text().notNull(),
  description: text(),
  enabled: bool().notNull().default(true),
  scope: text().notNull(),
  organizationId: uuid().notNull(),
  projectId: uuid().$defaultFn(() => null),
  eventType: text().notNull(),
  match: text().notNull().default('all'),
  conditions: json()
    .notNull()
    .$defaultFn(() => []),
  recipients: json().notNull(),
  channels: json()
    .notNull()
    .$defaultFn(() => ['mail']),
  throttleMinutes: integer().notNull().default(0),
  createdByUserId: uuid().notNull(),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const NotificationSettingsEntity = entity('notification_settings', {
  id: uuid().primaryKey(),
  organizationId: uuid().notNull(),
  allowedExternalEmailDomains: json()
    .notNull()
    .$defaultFn(() => []),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const ExternalRecipientEntity = entity('external_recipients', {
  id: uuid().primaryKey(),
  organizationId: uuid().notNull(),
  email: text().notNull(),
  status: text().notNull().default('pending'),
  verifiedAt: timestamp(),
  unsubscribedAt: timestamp(),
  blockedAt: timestamp(),
  verificationTokenHash: text(),
  verificationExpiresAt: timestamp(),
  lastVerificationSentAt: timestamp(),
  unsubscribeVersion: integer().notNull().default(0),
  createdByUserId: uuid().notNull(),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

relations.for(ProjectEntity, ({ one, many }) => ({
  roles: many(RoleEntity, { fields: ['id'], references: ['projectId'] }),
  organization: one(OrganizationEntity, { fields: ['organizationId'], references: ['id'] }),
  access: many(UserAccessEntity, { fields: ['id'], references: ['projectId'] }),
  codeReportServices: many(CodeReportServiceEntity, {
    fields: ['id'],
    references: ['projectId'],
  }),
  codeReportSecurityPolicies: many(CodeReportSecurityPolicyEntity, {
    fields: ['id'],
    references: ['projectId'],
  }),
  vaultEnvironments: many(VaultEnvironmentEntity, { fields: ['id'], references: ['projectId'] }),
  vaultFolders: many(VaultFolderEntity, { fields: ['id'], references: ['projectId'] }),
  vaultSecrets: many(VaultSecretEntity, { fields: ['id'], references: ['projectId'] }),
  vaultSettings: many(VaultSettingsEntity, { fields: ['id'], references: ['projectId'] }),
}));

relations.for(CodeReportSecurityPolicyEntity, ({ one }) => ({
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
}));

relations.for(VaultEnvironmentEntity, ({ one }) => ({
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
}));

relations.for(VaultFolderEntity, ({ one, many }) => ({
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
  parent: one(VaultFolderEntity, { fields: ['parentFolderId'], references: ['id'] }),
  linkedFolder: one(VaultFolderEntity, { fields: ['linkedFolderId'], references: ['id'] }),
  children: many(VaultFolderEntity, { fields: ['id'], references: ['parentFolderId'] }),
  secrets: many(VaultSecretEntity, { fields: ['id'], references: ['folderId'] }),
}));

relations.for(VaultSecretEntity, ({ one }) => ({
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
  folder: one(VaultFolderEntity, { fields: ['folderId'], references: ['id'] }),
}));

relations.for(VaultSettingsEntity, ({ one }) => ({
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
}));

relations.for(CodeReportServiceEntity, ({ one, many }) => ({
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
  analyses: many(CodeReportAnalysisEntity, { fields: ['id'], references: ['serviceId'] }),
}));

relations.for(MonitorEntity, ({ one }) => ({
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
  service: one(CodeReportServiceEntity, { fields: ['serviceId'], references: ['id'] }),
}));

relations.for(CodeReportAnalysisEntity, ({ one }) => ({
  service: one(CodeReportServiceEntity, { fields: ['serviceId'], references: ['id'] }),
}));

relations.for(RoleEntity, ({ one, many }) => ({
  organization: one(OrganizationEntity, { fields: ['organizationId'], references: ['id'] }),
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
  access: many(UserAccessEntity, { fields: ['id'], references: ['roleId'] }),
}));

relations.for(UserAccessEntity, ({ one }) => ({
  user: one(UserEntity, { fields: ['userId'], references: ['id'] }),
  role: one(RoleEntity, { fields: ['roleId'], references: ['id'] }),
  organization: one(OrganizationEntity, { fields: ['organizationId'], references: ['id'] }),
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
}));

relations.for(OrganizationEntity, ({ many }) => ({
  projects: many(ProjectEntity, { fields: ['id'], references: ['organizationId'] }),
  roles: many(RoleEntity, { fields: ['id'], references: ['organizationId'] }),
  access: many(UserAccessEntity, { fields: ['id'], references: ['organizationId'] }),
}));
