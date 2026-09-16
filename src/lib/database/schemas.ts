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

export const ProjectNotificationEntity = entity('project_notifications', {
  id: uuid().primaryKey(),
  projectId: uuid().notNull(),
  name: text().notNull(),
  description: text(),
  eventName: text().notNull(),
  channel: text().notNull().default('mail'),
  templateId: uuid(),
  filters: json()
    .notNull()
    .$defaultFn(() => []),
  providerConfig: json()
    .notNull()
    .$defaultFn(() => ({})),
  destinations: json()
    .notNull()
    .$defaultFn(() => []),
  recipients: json()
    .notNull()
    .$defaultFn(() => []),
  enabled: bool().notNull().default(true),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const ProjectNotificationTargetEntity = entity('project_notification_targets', {
  id: uuid().primaryKey(),
  projectId: uuid().notNull(),
  provider: text().notNull(),
  credentialEncrypted: text().notNull(),
  defaultTemplateId: uuid(),
  enabled: bool().notNull().default(true),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const ProjectNotificationTemplateEntity = entity('project_notification_templates', {
  id: uuid().primaryKey(),
  projectId: uuid().notNull(),
  provider: text().notNull(),
  name: text().notNull(),
  slug: text().notNull(),
  content: text().notNull(),
  format: text().notNull().default('text'),
  httpConfigEncrypted: text().notNull().default(''),
  recipients: json()
    .notNull()
    .$defaultFn(() => []),
  system: bool().notNull().default(false),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const ProjectNotificationDeliveryEntity = entity('project_notification_deliveries', {
  id: uuid().primaryKey(),
  projectId: uuid().notNull(),
  notificationId: uuid().notNull(),
  eventId: uuid().notNull(),
  eventName: text().notNull(),
  channel: text().notNull(),
  recipients: json()
    .notNull()
    .$defaultFn(() => []),
  status: text().notNull().default('pending'),
  error: text(),
  createdAt: timestamp()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  sentAt: timestamp(),
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
  // type-specific configuration, see $lib/code-report/security-policy
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
  notifications: many(ProjectNotificationEntity, { fields: ['id'], references: ['projectId'] }),
  notificationTargets: many(ProjectNotificationTargetEntity, {
    fields: ['id'],
    references: ['projectId'],
  }),
  notificationTemplates: many(ProjectNotificationTemplateEntity, {
    fields: ['id'],
    references: ['projectId'],
  }),
  notificationDeliveries: many(ProjectNotificationDeliveryEntity, {
    fields: ['id'],
    references: ['projectId'],
  }),
}));

relations.for(ProjectNotificationEntity, ({ one, many }) => ({
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
  template: one(ProjectNotificationTemplateEntity, {
    fields: ['templateId'],
    references: ['id'],
  }),
  deliveries: many(ProjectNotificationDeliveryEntity, {
    fields: ['id'],
    references: ['notificationId'],
  }),
}));

relations.for(ProjectNotificationTargetEntity, ({ one }) => ({
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
  defaultTemplate: one(ProjectNotificationTemplateEntity, {
    fields: ['defaultTemplateId'],
    references: ['id'],
  }),
}));

relations.for(ProjectNotificationTemplateEntity, ({ one }) => ({
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
}));

relations.for(ProjectNotificationDeliveryEntity, ({ one }) => ({
  project: one(ProjectEntity, { fields: ['projectId'], references: ['id'] }),
  notification: one(ProjectNotificationEntity, {
    fields: ['notificationId'],
    references: ['id'],
  }),
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
