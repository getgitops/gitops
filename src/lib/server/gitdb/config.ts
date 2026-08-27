import { env } from '$env/dynamic/private';

export type GitDbAuthMode = 'none' | 'basic' | 'token';

export type GitDbRepositoryConfig = {
  repositoryUrl: string;
  branch: string;
  authMode: GitDbAuthMode;
  username: string | null;
  /** Kept in memory only; sourced from the environment, never persisted or serialized. */
  secret: string | null;
  authorName: string;
  authorEmail: string;
  syncPollSeconds: number;
  dataPath: string;
};

/** Safe projection for the browser: credentials are never included. */
export type GitDbRepositoryConfigView = Omit<GitDbRepositoryConfig, 'secret'> & {
  hasSecret: boolean;
};

export const MIN_SYNC_POLL_SECONDS = 10;
export const MAX_SYNC_POLL_SECONDS = 86_400;
export const DEFAULT_SYNC_POLL_SECONDS = 60;

function value(name: string): string | null {
  return env[name]?.trim() || null;
}

function resolveSyncPollSeconds(): number {
  const raw = value('GITDB_SYNC_POLL_SECONDS');
  if (!raw) return DEFAULT_SYNC_POLL_SECONDS;

  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) {
    throw new Error('GITDB_SYNC_POLL_SECONDS must be a number');
  }
  if (seconds < MIN_SYNC_POLL_SECONDS || seconds > MAX_SYNC_POLL_SECONDS) {
    throw new Error(
      `GITDB_SYNC_POLL_SECONDS must be between ${MIN_SYNC_POLL_SECONDS} and ${MAX_SYNC_POLL_SECONDS}`,
    );
  }
  return Math.round(seconds);
}

let cached: GitDbRepositoryConfig | null | undefined;

export function readRepositoryConfig(): GitDbRepositoryConfig | null {
  if (cached !== undefined) {
    return cached;
  }

  const repositoryUrl = value('GITDB_REPOSITORY_URL');
  if (!repositoryUrl) {
    cached = null;
    return cached;
  }

  const token = value('GITDB_TOKEN');
  const username = value('GITDB_USERNAME');
  const password = value('GITDB_PASSWORD');

  let authMode: GitDbAuthMode = 'none';
  let secret: string | null = null;

  if (token) {
    authMode = 'token';
    secret = token;
  } else if (username && password) {
    authMode = 'basic';
    secret = password;
  } else if (username || password) {
    throw new Error('GITDB_USERNAME and GITDB_PASSWORD must be set together');
  }

  cached = {
    repositoryUrl,
    branch: value('GITDB_BRANCH') ?? 'main',
    authMode,
    username,
    secret,
    authorName: value('GITDB_AUTHOR_NAME') ?? 'gitops',
    authorEmail: value('GITDB_AUTHOR_EMAIL') ?? 'gitops@getgitops.local',
    syncPollSeconds: resolveSyncPollSeconds(),
    dataPath: value('GITDB_DATA_PATH') ?? '/data/gitdb',
  };

  return cached;
}

export function requireRepositoryConfig(): GitDbRepositoryConfig {
  const config = readRepositoryConfig();
  if (!config) {
    throw new Error('GITDB_REPOSITORY_URL is not set. Configure it in the environment.');
  }
  return config;
}

export function isRepositoryConfigured(): boolean {
  return readRepositoryConfig() !== null;
}

export function toConfigView(config: GitDbRepositoryConfig): GitDbRepositoryConfigView {
  const { secret, ...rest } = config;
  return { ...rest, repositoryUrl: redactUrl(rest.repositoryUrl), hasSecret: Boolean(secret) };
}

export function readRepositoryConfigView(): GitDbRepositoryConfigView | null {
  const config = readRepositoryConfig();
  return config ? toConfigView(config) : null;
}

/**
 * Remote URL with credentials injected. Only ever passed to git as an argv value,
 * never written to .git/config and never returned to the client.
 */
export function buildAuthenticatedUrl(config: GitDbRepositoryConfig): string {
  if (config.authMode === 'none' || !config.secret) {
    return config.repositoryUrl;
  }

  let url: URL;
  try {
    url = new URL(config.repositoryUrl);
  } catch {
    // ssh/scp remotes rely on the agent or deploy keys, nothing to inject
    return config.repositoryUrl;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return config.repositoryUrl;
  }

  // the URL setter percent-encodes the userinfo component on assignment
  url.username = config.authMode === 'token' ? config.username || 'git' : (config.username ?? '');
  url.password = config.secret;
  return url.toString();
}

/** Strips any embedded credentials so URLs are safe to log or display. */
export function redactUrl(value: string): string {
  return value.replace(/\/\/[^/@\s]+@/g, '//***@');
}
