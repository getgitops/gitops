import { describe, expect, it } from 'vitest';
import { defineRelations } from './relations.ts';
import { entity, integer, text } from './schema.ts';

describe('defineRelations', () => {
  it('define relaciones one y many y permite resolverlas por entidad', () => {
    const users = entity('users', {
      id: integer().primaryKey(),
      roleId: integer().notNull(),
      name: text().notNull(),
    });

    const roles = entity('roles', {
      id: integer().primaryKey(),
      name: text().notNull(),
    });

    const posts = entity('posts', {
      id: integer().primaryKey(),
      userId: integer().notNull(),
      title: text().notNull(),
    });

    const relations = defineRelations();

    relations.for(users, ({ one, many }) => ({
      role: one(roles, { fields: ['roleId'], references: ['id'] }),
      posts: many(posts, { fields: ['id'], references: ['userId'] }),
    }));

    const usersRelations = relations.get(users);
    expect(usersRelations.role.kind).toBe('one');
    expect(usersRelations.role.targetEntity).toBe('roles');
    expect(usersRelations.posts.kind).toBe('many');
    expect(usersRelations.posts.targetEntity).toBe('posts');

    const resolved = relations.resolve('users', 'role');
    expect(resolved?.fields).toEqual(['roleId']);
    expect(resolved?.references).toEqual(['id']);
  });

  it('falla si one no define fields/references', () => {
    const users = entity('users', {
      id: integer().primaryKey(),
      roleId: integer().notNull(),
    });

    const roles = entity('roles', {
      id: integer().primaryKey(),
    });

    const relations = defineRelations();

    expect(() => {
      relations.for(users, ({ one }) => ({
        role: one(roles, { fields: [], references: [] }),
      }));
    }).toThrow('requires fields and references');
  });

  it('falla cuando fields y references no tienen misma longitud', () => {
    const users = entity('users', {
      id: integer().primaryKey(),
      roleId: integer().notNull(),
      backupRoleId: integer().notNull(),
    });

    const roles = entity('roles', {
      id: integer().primaryKey(),
    });

    const relations = defineRelations();

    expect(() => {
      relations.for(users, ({ one }) => ({
        role: one(roles, { fields: ['roleId', 'backupRoleId'], references: ['id'] }),
      }));
    }).toThrow('same length');
  });

  it('falla si field local o reference remota no existen en schema', () => {
    const users = entity('users', {
      id: integer().primaryKey(),
      roleId: integer().notNull(),
    });

    const roles = entity('roles', {
      id: integer().primaryKey(),
    });

    const relations = defineRelations();

    expect(() => {
      relations.for(users, ({ one }) => ({
        role: one(roles, { fields: ['missingField'], references: ['id'] }),
      }));
    }).toThrow("does not exist in entity 'users'");

    expect(() => {
      relations.for(users, ({ one }) => ({
        role: one(roles, { fields: ['roleId'], references: ['missingRef'] }),
      }));
    }).toThrow("does not exist in entity 'roles'");
  });
});
