import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';

export type GitDbAuthMode = 'none' | 'basic' | 'token';

export type GitDbRepositoryConfig = {
  repositoryUrl: string;
  branch: string;
  authMode: GitDbAuthMode;
  username: string | null;
  /** AES-256-GCM payload holding the password or token. Never leaves the server. */
  secret: string | null;
  authorName: string;
  authorEmail: string;
  syncPollSeconds: number;
  configuredAt: string;
  updatedAt: string;
};

/** Safe projection sent to the browser: credentials are never included. */
export type GitDbRepositoryConfigView = Omit<GitDbRepositoryConfig, 'secret'> & {
  hasSecret: boolean;
};

export const MIN_SYNC_POLL_SECONDS = 10;
export const MAX_SYNC_POLL_SECONDS = 86_400;
export const DEFAULT_SYNC_POLL_SECONDS = 60;

const CONFIG_DIR = path.resolve(process.cwd(), 'data', 'cluster');
const CONFIG_PATH = path.join(CONFIG_DIR, 'gitdb.config.json');

let cached: GitDbRepositoryConfig | null | undefined;

function encryptionKey(): Buffer {
  const secret = env.GITDB_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error('Missing GITDB_ENCRYPTION_KEY environment variable');
  }
  return crypto.scryptSync(secret, 'gitdb-repository-config', 32);
}

function encrypt(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const payload = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), payload.toString('base64')].join(':');
}

function decrypt(value: string): string {
  const [iv, tag, payload] = value.split(':');
  if (!iv || !tag || !payload) {
    throw new Error('Stored repository credential is corrupted');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8');
}

export function readRepositoryConfig(): GitDbRepositoryConfig | null {
  if (cached !== undefined) {
    return cached;
  }

  if (!existsSync(CONFIG_PATH)) {
    cached = null;
    return cached;
  }

  cached = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as GitDbRepositoryConfig;
  return cached;
}

export function toConfigView(config: GitDbRepositoryConfig): GitDbRepositoryConfigView {
  const { secret, ...rest } = config;
  return { ...rest, hasSecret: Boolean(secret) };
}

export function readRepositoryConfigView(): GitDbRepositoryConfigView | null {
  const config = readRepositoryConfig();
  return config ? toConfigView(config) : null;
}

export function isRepositoryConfigured(): boolean {
  return Boolean(readRepositoryConfig()?.repositoryUrl);
}

export type SaveRepositoryConfigInput = {
  repositoryUrl: string;
  branch?: string;
  authMode: GitDbAuthMode;
  username?: string | null;
  /** Leave undefined to keep the currently stored credential. */
  secret?: string | null;
  authorName?: string;
  authorEmail?: string;
  syncPollSeconds?: number;
};

function assertSupportedUrl(repositoryUrl: string): void {
  if (/^(https?|ssh|git):\/\//i.test(repositoryUrl)) return;
  // scp-like syntax, e.g. git@github.com:org/repo.git
  if (/^[\w.-]+@[\w.-]+:.+$/.test(repositoryUrl)) return;
  throw new Error('Repository URL must be an http(s), ssh or git remote');
}

export function saveRepositoryConfig(input: SaveRepositoryConfigInput): GitDbRepositoryConfig {
  const repositoryUrl = input.repositoryUrl.trim();
  if (!repositoryUrl) {
    throw new Error('Repository URL is required');
  }
  assertSupportedUrl(repositoryUrl);

  const existing = readRepositoryConfig();
  const username = input.username?.trim() || null;

  if (input.authMode === 'basic' && !username) {
    throw new Error('Username is required for user/password authentication');
  }

  let secret: string | null = existing?.secret ?? null;
  if (input.secret !== undefined) {
    const plain = input.secret?.trim();
    secret = plain ? encrypt(plain) : null;
  }
  if (input.authMode === 'none') {
    secret = null;
  } else if (!secret) {
    throw new Error(input.authMode === 'token' ? 'Token is required' : 'Password is required');
  }

  const syncPollSeconds = normalizeSyncPollSeconds(
    input.syncPollSeconds ?? existing?.syncPollSeconds ?? DEFAULT_SYNC_POLL_SECONDS,
  );

  const now = new Date().toISOString();
  const config: GitDbRepositoryConfig = {
    repositoryUrl,
    branch: input.branch?.trim() || existing?.branch || 'main',
    authMode: input.authMode,
    username: input.authMode === 'none' ? null : username,
    secret,
    authorName: input.authorName?.trim() || existing?.authorName || 'gitvault-suite',
    authorEmail: input.authorEmail?.trim() || existing?.authorEmail || 'gitvault-suite@getgitops.local',
    syncPollSeconds,
    configuredAt: existing?.configuredAt ?? now,
    updatedAt: now,
  };

  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  cached = config;
  return config;
}

export function normalizeSyncPollSeconds(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Sync poll interval must be a number');
  }
  const seconds = Math.round(value);
  if (seconds < MIN_SYNC_POLL_SECONDS || seconds > MAX_SYNC_POLL_SECONDS) {
    throw new Error(
      `Sync poll interval must be between ${MIN_SYNC_POLL_SECONDS} and ${MAX_SYNC_POLL_SECONDS} seconds`,
    );
  }
  return seconds;
}

export function saveSyncPollSeconds(value: number): GitDbRepositoryConfig {
  const existing = readRepositoryConfig();
  if (!existing) {
    throw new Error('Repository is not configured yet');
  }
  return saveRepositoryConfig({ ...existing, syncPollSeconds: value, secret: undefined });
}

/**
 * Remote URL with credentials injected. Only ever passed to git as an argv value,
 * never persisted to .git/config and never returned to the client.
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

  const secret = decrypt(config.secret);
  // the URL setter percent-encodes the userinfo component on assignment
  url.username = config.authMode === 'token' ? (config.username || 'git') : (config.username ?? '');
  url.password = secret;
  return url.toString();
}

/** Strips any embedded credentials so URLs are safe to log or display. */
export function redactUrl(value: string): string {
  return value.replace(/\/\/[^/@\s]+@/g, '//***@');
}
