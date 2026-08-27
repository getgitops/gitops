import { gitDb, type GitDB } from '@getgitops/gitdb';
import {
  buildAuthenticatedUrl,
  isRepositoryConfigured,
  redactUrl,
  requireRepositoryConfig,
  resolveRepositoryWebUrl,
} from './config';
import { gitDbSyncService } from './sync';

let instance: GitDB | null = null;
let startup: Promise<void> | null = null;

export { isRepositoryConfigured };

/** Browsable repo URL for building commit links, or null when it can't be derived. */
export function getRepositoryWebUrl(): string | null {
  try {
    const config = requireRepositoryConfig();
    return resolveRepositoryWebUrl(config.repositoryUrl);
  } catch {
    return null;
  }
}

/**
 * Initializes GitDB instance and sync state.
 * Runs once per process, not per request.
 */
export function startGitDb(): Promise<void> {
  if (!startup) {
    startup = boot().catch((error) => {
      startup = null;
      throw error;
    });
  }
  return startup;
}

async function boot(): Promise<void> {
  const config = requireRepositoryConfig();
  console.info('[gitdb] starting', {
    repository: redactUrl(config.repositoryUrl),
    branch: config.branch,
    authMode: config.authMode,
    syncPollSeconds: config.syncPollSeconds,
  });

  instance = createClient(config.authorName, config.authorEmail);

  // await gitDbSyncService.syncNow();

  console.info('[gitdb] ready');
}

function createClient(authorName: string, authorEmail: string): GitDB {
  const config = requireRepositoryConfig();
  return gitDb(buildAuthenticatedUrl(config), {
    gitUserName: authorName,
    gitUserEmail: authorEmail,
    syncPollSeconds: config.syncPollSeconds,
    dataPath: config.dataPath,
  });
}

export function getGitDb(): GitDB {
  if (instance) {
    return instance;
  }

  const config = requireRepositoryConfig();
  instance = createClient(config.authorName, config.authorEmail);
  return instance;
}