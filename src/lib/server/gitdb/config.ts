import { env } from '$env/dynamic/private';

export type GitDbAuthMode = 'none' | 'basic' | 'token';

/**
 * - `'poll'` (default): commits accumulate locally and are pushed periodically based on `syncPollSeconds`.
 * - `'immediate'`: every commit is pushed right away.
 */
export type GitDbSyncMode = 'poll' | 'immediate';

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
  syncMode: GitDbSyncMode;
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
  const raw = env[name]?.trim();
  if (!raw) return null;

  const quote = raw[0];
  return (quote === '"' || quote === "'") && raw.endsWith(quote)
    ? raw.slice(1, -1).trim() || null
    : raw;
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

function resolveSyncMode(): GitDbSyncMode {
  const raw = value('GITDB_SYNC_MODE')?.toLowerCase();
  if (!raw || raw === 'poll') return 'poll';
  if (raw === 'immediate') return 'immediate';
  throw new Error("GITDB_SYNC_MODE must be 'poll' or 'immediate'");
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
    syncMode: resolveSyncMode(),
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
 * Username/token pair for HTTPS auth, resolved transiently for each git operation.
 * Never embedded into `repositoryUrl`, never persisted, never logged.
 */
export function resolveAuthCredentials(config: GitDbRepositoryConfig): { authUsername: string; authToken: string } {
  if (config.authMode === 'none' || !config.secret) {
    return { authUsername: '', authToken: '' };
  }

  try {
    const url = new URL(config.repositoryUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      // ssh/scp remotes rely on the agent or deploy keys, nothing to inject
      return { authUsername: '', authToken: '' };
    }
  } catch {
    return { authUsername: '', authToken: '' };
  }

  const authUsername = config.authMode === 'token' ? config.username || 'git' : (config.username ?? '');
  return { authUsername, authToken: config.secret };
}

/** Strips any embedded credentials so URLs are safe to log or display. */
export function redactUrl(value: string): string {
  return value.replace(/\/\/[^/@\s]+@/g, '//***@');
}

/** Best-effort browsable repo URL (github/gitlab/bitbucket-style), or null when it can't be derived. */
export function resolveRepositoryWebUrl(repositoryUrl: string): string | null {
  const withoutGitSuffix = repositoryUrl.replace(/\.git$/, '');

  // git@host:owner/repo -> https://host/owner/repo
  const scpMatch = withoutGitSuffix.match(/^[\w-]+@([^:]+):(.+)$/);
  if (scpMatch) {
    return `https://${scpMatch[1]}/${scpMatch[2]}`;
  }

  try {
    const url = new URL(withoutGitSuffix);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    url.username = '';
    url.password = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** Web URL for a specific commit in the configured repository, or null when unavailable. */
export function resolveCommitUrl(commitHash: string): string | null {
  const config = readRepositoryConfig();
  if (!config) return null;

  const webUrl = resolveRepositoryWebUrl(config.repositoryUrl);
  return webUrl ? `${webUrl}/commit/${commitHash}` : null;
}
