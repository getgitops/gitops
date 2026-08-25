import { gitDb, type GitDB } from '@getgitops/gitdb';
import { isRepositoryConfigured, redactUrl, requireRepositoryConfig } from './config';
import { gitDbSyncService } from './sync';

let instance: GitDB | null = null;
let startup: Promise<void> | null = null;

export { isRepositoryConfigured };

/**
 * Clones the repository into `.gitdb/`, writes the manifest and starts the sync poll.
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

  await gitDbSyncService.ensureCloned(config);

  instance = createClient(config.authorName, config.authorEmail);

  gitDbSyncService.schedule();
  await gitDbSyncService.syncNow();

  console.info('[gitdb] ready');
}

function createClient(authorName: string, authorEmail: string): GitDB {
  const config = requireRepositoryConfig();
  // the clone is owned by the sync service, which keeps credentials out of .git/config
  return gitDb(config.repositoryUrl, {
    gitUserName: authorName,
    gitUserEmail: authorEmail,
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