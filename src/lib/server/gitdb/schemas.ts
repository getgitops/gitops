import { uuid, bool, entity, json, text, timestamp, defineRelations } from '@getgitops/gitdb';

export const User = entity('users', {
  id: uuid().primaryKey(),
  username: text().notNull().unique(),
  email: text(),
  passwordHash: text().notNull(),
  roleId: text().notNull(),
  status: text().notNull().default('active'),
  authProviders: json().notNull().$defaultFn(() => []),
  createdAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
  lastLoginAt: timestamp(),
  disabled: bool().notNull().default(false),
});

export const Role = entity('roles', {
  id: uuid().primaryKey(),
  name: text().notNull().unique(),
  description: text().notNull().default(''),
  permissions: json().notNull().$defaultFn(() => []),
  createdAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp().notNull().$defaultFn(() => new Date().toISOString()),
});



export const relations = defineRelations();

relations.for(User, ({ one }) => ({
  role: one(Role, { fields: ['roleId'], references: ['id'] }),
}));