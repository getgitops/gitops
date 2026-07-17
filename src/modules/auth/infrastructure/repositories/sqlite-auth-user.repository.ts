import type { DatabaseClient } from '$lib/database/types';
import type { AuthUserRepository } from '../../domain/repositories';
import type { AuthUser, CreateUserInput, Role, UserView } from '../../domain/entities';

type UserRow = {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  role: string;
  created_at: string;
};

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
};

export class SqliteAuthUserRepository implements AuthUserRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findById(id: string): Promise<AuthUser | null> {
    const row = this.db.get<UserRow>(
      'SELECT id, username, email, password_hash, role, created_at FROM users WHERE id = ?',
      [id],
    );

    return row ? this.toAuthUser(row) : null;
  }

  async findByUsername(username: string): Promise<AuthUser | null> {
    const row = this.db.get<UserRow>(
      'SELECT id, username, email, password_hash, role, created_at FROM users WHERE username = ?',
      [username],
    );

    return row ? this.toAuthUser(row) : null;
  }

  async listUsers(): Promise<UserView[]> {
    const rows = this.db.all<Array<Omit<UserRow, 'password_hash'>>[number]>(
      'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC',
    );

    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      role: this.normalizeRole(row.role),
      createdAt: row.created_at,
    }));
  }

  async createUser(input: CreateUserInput): Promise<void> {
    this.db.run(
      `
      INSERT INTO users (id, username, email, password_hash, role)
      VALUES (@id, @username, @email, @password_hash, @role)
    `,
      {
        id: input.id,
        username: input.username,
        email: input.email,
        password_hash: input.passwordHash,
        role: input.role,
      },
    );
  }

  async updateEmail(userId: string, email: string | null): Promise<void> {
    this.db.run('UPDATE users SET email = ? WHERE id = ?', [email, userId]);
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
  }

  async updateRole(userId: string, role: Role): Promise<void> {
    this.db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
  }

  async deleteById(userId: string): Promise<void> {
    this.db.run('DELETE FROM users WHERE id = ?', [userId]);
  }

  async countAdmins(): Promise<number> {
    const row = this.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");

    return row?.count ?? 0;
  }

  async listActiveApiKeys(userId: string): Promise<Array<{
    id: string;
    name: string;
    keyPrefix: string;
    lastUsedAt: string | null;
    createdAt: string;
  }>> {
    const rows = this.db.all<ApiKeyRow>(
      `
      SELECT id, name, key_prefix, last_used_at, created_at
      FROM api_keys
      WHERE user_id = ? AND revoked_at IS NULL
      ORDER BY created_at DESC
    `,
      [userId],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      keyPrefix: row.key_prefix,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    }));
  }

  async createApiKey(input: {
    id: string;
    userId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
  }): Promise<void> {
    this.db.run(
      `
      INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash)
      VALUES (?, ?, ?, ?, ?)
    `,
      [input.id, input.userId, input.name, input.keyPrefix, input.keyHash],
    );
  }

  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    this.db.run(
      `
      UPDATE api_keys
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
      [keyId, userId],
    );
  }

  private toAuthUser(row: UserRow): AuthUser {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      role: this.normalizeRole(row.role),
      createdAt: row.created_at,
    };
  }

  private normalizeRole(role: string): Role {
    return role === 'admin' ? 'admin' : 'developer';
  }
}
