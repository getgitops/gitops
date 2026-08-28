import { bool, defineRelations, entity, json, text, timestamp, uuid } from '@getgitops/gitdb';

export const UserEntity = entity('users', {
  id: uuid().primaryKey(),
  username: text().notNull(),
  email: text(),
  passwordHash: text().notNull(),
  roleId: uuid().notNull(),
  status: text().notNull().default('active'),
  invitationTokenHash: text(),
  invitationExpiresAt: timestamp(),
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
  organizationId: uuid(),
  projectId: uuid(),
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
  userId: uuid(),
  projectId: uuid(),
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
  organizationId: uuid(),
  projectId: uuid(),
  status: text().notNull().default('active'),
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
}));

relations.for(CodeReportSecurityPolicyEntity, ({ one }) => ({
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
