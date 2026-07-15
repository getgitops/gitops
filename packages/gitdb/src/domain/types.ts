export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type EntityRecord = Record<string, JsonValue>;

export type Predicate<T> = (item: T) => boolean;

export interface GitDBOptions {
  repositoryPath?: string;
  autoCommitIntervalMs?: number;
  immediateCommitDelayMs?: number;
  gitUserName?: string;
  gitUserEmail?: string;
}

export interface ModelOptions {
  idField?: string;
}

export type ResolvedGitDBOptions = Required<GitDBOptions>;
