import type { DatabaseClient } from '$lib/database/types';
import type { AuthConfigRepository } from '../../domain/repositories';

type ConfigRow = {
  encryption_key?: string | null;
};

export class SqliteAuthConfigRepository implements AuthConfigRepository {
  constructor(private readonly db: DatabaseClient) {}

  findEncryptionKey(): string | null {
    const row = this.db.get<ConfigRow>('SELECT encryption_key FROM config WHERE id = 1');

    return row?.encryption_key ?? null;
  }

  saveEncryptionKey(key: string): void {
    this.db.run(
      `
      INSERT INTO config (id, auth_method, encryption_key)
      VALUES (1, 'none', ?)
      ON CONFLICT(id) DO UPDATE SET encryption_key = excluded.encryption_key
    `,
      [key],
    );
  }
}
