import type Database from 'better-sqlite3';
import type { DatabaseClient, DatabaseParams } from './types';

export class SqliteDatabaseClient implements DatabaseClient {
  constructor(private readonly sqlite: Database.Database) {}

  exec(sql: string): void {
    this.sqlite.exec(sql);
  }

  get<T>(sql: string, params?: DatabaseParams): T | undefined {
    if (params === undefined) {
      return this.sqlite.prepare(sql).get() as T | undefined;
    }

    return this.sqlite.prepare(sql).get(params as never) as T | undefined;
  }

  all<T>(sql: string, params?: DatabaseParams): T[] {
    if (params === undefined) {
      return this.sqlite.prepare(sql).all() as T[];
    }

    return this.sqlite.prepare(sql).all(params as never) as T[];
  }

  run(sql: string, params?: DatabaseParams): void {
    if (params === undefined) {
      this.sqlite.prepare(sql).run();
      return;
    }

    this.sqlite.prepare(sql).run(params as never);
  }

  transaction<T>(callback: () => T): T {
    const wrapped = this.sqlite.transaction(callback);
    return wrapped();
  }
}
