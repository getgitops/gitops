import { env } from '$env/dynamic/private';
import { gitDb, type GitDB } from '@getgitops/gitdb';
import { isRepositoryConfigured, readRepositoryConfig } from './config';
import { gitDbSyncService } from './sync';

let instance: GitDB | null = null;

export { isRepositoryConfigured };

export function getGitDb(): GitDB {
  if (instance) {
    return instance;
  }

  const config = readRepositoryConfig();
  if (!config) {
    throw new Error('GitDB repository is not configured. Complete the setup at /bootstrap.');
  }

  // the clone is owned by the sync service, which keeps credentials out of .git/config
  instance = gitDb(config.repositoryUrl, {
    gitUserName: env.GITDB_AUTHOR_NAME ?? config.authorName,
    gitUserEmail: env.GITDB_AUTHOR_EMAIL ?? config.authorEmail,
  });

  gitDbSyncService.schedule();

  console.info('[gitdb] initialized');
  return instance;
}

/** Drops the cached client so the next access picks up a new repository configuration. */
export function resetGitDb(): void {
  const previous = instance;
  instance = null;
  gitDbSyncService.stop();
  void previous?.close().catch(() => {
    // A stale client failing to shut down must not block reconfiguration.
  });
}