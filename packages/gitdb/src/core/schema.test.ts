import { describe, expect, it } from 'vitest';
import {
  bool,
  char,
  double,
  doublePrecision,
  entity,
  int,
  integer,
  text,
  uuid,
  validateEntityRow,
  varchar,
} from './schema.ts';

describe('schema definitions', () => {
  it('crea columnas con builders estilo drizzle', () => {
    const users = entity('users', {
      id: integer().primaryKey().autoincrement(),
      name: text().notNull(),
      email: varchar({ length: 255 }).unique(),
      profileId: uuid().notNull(),
      isActive: bool().default(true),
      score: double().default(0),
      rank: int(),
      code: char({ length: 4 }),
    });

    expect(users.schema.id.dataType).toBe('integer');
    expect(users.schema.id.primaryKey).toBe(true);
    expect(users.schema.id.autoincrement).toBe(true);
    expect(users.schema.name.notNull).toBe(true);
    expect(users.schema.email.length).toBe(255);
    expect(users.schema.email.unique).toBe(true);
    expect(users.schema.isActive.defaultValue).toBe(true);
    expect(users.schema.rank.dataType).toBe('integer');
    expect(users.schema.code.length).toBe(4);
  });

  it('mantiene alias compatibles', () => {
    expect(doublePrecision().build().dataType).toBe('double');
    expect(int().build().dataType).toBe('integer');
    expect(bool().build().dataType).toBe('boolean');
  });

  it('soporta legacy schema strings', () => {
    const users = entity('users', {
      id: 'int',
      name: 'string',
      active: 'boolean',
      amount: 'double',
    });

    expect(users.schema.id.dataType).toBe('integer');
    expect(users.schema.name.dataType).toBe('text');
    expect(users.schema.active.dataType).toBe('boolean');
    expect(users.schema.amount.dataType).toBe('double');
  });

  it('permite references con entity o nombre', () => {
    const organizations = entity('organizations', {
      id: integer().primaryKey(),
      name: text().notNull(),
    });

    const users = entity('users', {
      id: integer().primaryKey(),
      orgId: integer().references(organizations),
      ownerId: integer().references('users', 'id'),
    });

    expect(users.schema.orgId.references).toEqual({ entity: 'organizations', field: 'id' });
    expect(users.schema.ownerId.references).toEqual({ entity: 'users', field: 'id' });
  });

  it('prepara validacion para inserts y updates', () => {
    const users = entity('users', {
      id: integer().primaryKey().autoincrement(),
      name: text().notNull(),
      email: text().notNull(),
      active: bool().default(true),
    });

    const insertMissing = validateEntityRow(users, { email: 'a@b.com' }, 'insert');
    expect(insertMissing.valid).toBe(false);
    expect(insertMissing.errors.some((error) => error.includes('name'))).toBe(true);

    const insertBadType = validateEntityRow(users, { name: 'Ana', email: 123 }, 'insert');
    expect(insertBadType.valid).toBe(false);
    expect(insertBadType.errors.some((error) => error.includes('email'))).toBe(true);

    const updatePartial = validateEntityRow(users, { active: false }, 'update');
    expect(updatePartial.valid).toBe(true);
  });
});
