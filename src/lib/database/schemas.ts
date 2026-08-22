import { bool, defineRelations, entity, json, text, timestamp, uuid } from '@getgitops/gitdb';

export const UserEntity = entity('users', {
  id: uuid().primaryKey(),
  username: text().notNull(),
  email: text(),
  passwordHash: text().notNull(),
  roleId: uuid().notNull(),
  status: text().notNull().default('active'),
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

export const ApiKeyEntity = entity('api_keys', {
  id: uuid().primaryKey(),
  userId: uuid().notNull(),
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
    .$defaultFn(() => ({ vault: true, openreport: true, stateiac: true })),
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
