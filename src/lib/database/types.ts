export type DatabasePrimitive = string | number | bigint | Buffer | null;

export type DatabasePositionalParams = DatabasePrimitive[];

export type DatabaseNamedParams = Record<string, DatabasePrimitive>;

export type DatabaseParams = DatabasePositionalParams | DatabaseNamedParams;

export interface DatabaseClient {
  exec(sql: string): void;
  get<T>(sql: string, params?: DatabaseParams): T | undefined;
  all<T>(sql: string, params?: DatabaseParams): T[];
  run(sql: string, params?: DatabaseParams): void;
  transaction<T>(callback: () => T): T;
}
