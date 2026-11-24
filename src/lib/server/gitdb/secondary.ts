import { gitDb } from '@getgitops/gitdb';
import { createGitDbLogger, createLogger } from '../logger';
import { CachedGitDb } from './cached-client';
import { redactUrl, requireRepositoryConfig, resolveAuthCredentials } from './config';

const log = createLogger('gitdb');

export type SecondaryRepositoryOptions = {
  /** Short name for logs and the default data path (`<GITDB_DATA_PATH>-<name>`). */
  name: string;
  repositoryUrl: string;
  branch: string;
  dataPath: string | null;
  /** HTTPS token; without it the main repository credentials are reused. */
  token: string | null;
};

/**
 * A second GitDB repository for high-volume, low-value data (monitoring metrics) that should not
 * share the history of the main repository. Same commit identity, sync mode and poll interval as
 * the main one. Writes are made as the system identity, never as the request's actor.
 */
export async function startSecondaryGitDb(
  options: SecondaryRepositoryOptions,
): Promise<CachedGitDb> {
  const main = requireRepositoryConfig();
  const dataPath = options.dataPath ?? `${main.dataPath.replace(/\/+$/, '')}-${options.name}`;

  // a dedicated token wins; otherwise the main repository credentials (same provider, usually)
  const { authUsername, authToken } = options.token
    ? { authUsername: main.username || 'git', authToken: options.token }
    : resolveAuthCredentials({ ...main, repositoryUrl: options.repositoryUrl });

  log.info(
    {
      name: options.name,
      repository: redactUrl(options.repositoryUrl),
      branch: options.branch,
      dataPath,
    },
    'secondary gitdb starting',
  );

  const db = gitDb(options.repositoryUrl, {
    branch: options.branch,
    gitUserName: main.authorName,
    gitUserEmail: main.authorEmail,
    syncPollSeconds: main.syncPollSeconds,
    syncMode: main.syncMode,
    dataPath,
    authUsername,
    authToken,
    logger: createGitDbLogger(`gitdb-${options.name}`),
  });
  const client = new CachedGitDb(db, dataPath);
  try {
    await client.ready();
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
  log.info({ name: options.name }, 'secondary gitdb ready');
  return client;
}
