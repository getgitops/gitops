import { bool, defineRelations, entity, json, text, timestamp, uuid } from '@getgitops/gitdb';

export const UserEntity = entity('users', {
  id: uuid().primaryKey(),
  username: text().notNull(),
  email: text(),
  passwordHash: text().notNull(),
  roleId: uuid().notNull(),
  status: text().notNull().default('active'),
  authProviders: json().notNull().$defaultFn(() => []),
  createdAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
  lastLoginAt: timestamp(),
  disabled: bool().notNull().default(false),
});

export const RoleEntity = entity('roles', {
  id: uuid().primaryKey(),
  name: text().notNull(),
  description: text().notNull().default(''),
  permissions: json().notNull().$defaultFn(() => []),
  createdAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
});

export const ApiKeyEntity = entity('api_keys', {
  id: uuid().primaryKey(),
  userId: uuid().notNull(),
  name: text().notNull(),
  keyPrefix: text().notNull(),
  keyHash: text().notNull(),
  lastUsedAt: timestamp(),
  revokedAt: timestamp(),
  createdAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
});

export const relations = defineRelations();

relations.for(UserEntity, ({ one }) => ({
  role: one(RoleEntity, { fields: ['roleId'], references: ['id'] }),
}));