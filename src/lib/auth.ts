import crypto from 'crypto';
import { db } from './db';

export function ensureEncryptionKey(): string {
  const row = db.prepare('SELECT encryption_key FROM config WHERE id = 1').get() as
    { encryption_key?: string | null } | undefined;
  if (row?.encryption_key) {
    return row.encryption_key;
  }

  const newKey = crypto.randomBytes(32).toString('hex');
  db.prepare(
    `
    INSERT INTO config (id, auth_method, encryption_key)
    VALUES (1, 'none', ?)
    ON CONFLICT(id) DO UPDATE SET encryption_key = excluded.encryption_key
  `,
  ).run(newKey);

  return newKey;
}

export function hashPassword(password: string): string {
  const salt = ensureEncryptionKey();
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export function ensureAdminUser() {
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hash = hashPassword('admin');
    db.prepare(
      `
      INSERT INTO users (id, username, email, password_hash, role)
      VALUES (@id, @username, @email, @password_hash, @role)
    `,
    ).run({
      id: crypto.randomUUID(),
      username: 'admin',
      email: null,
      password_hash: hash,
      role: 'admin',
    });
    console.log('Default admin user created (admin:admin)');
  }
}

ensureEncryptionKey();
ensureAdminUser();
