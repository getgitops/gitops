import { gitDb, type GitDB } from '@getgitops/gitdb';
import {
  isRepositoryConfigured,
  redactUrl,
  requireRepositoryConfig,
  resolveAuthCredentials,
  resolveRepositoryWebUrl,
} from './config';
import { getCurrentActor } from '../request-context';
import { createGitDbLogger, createLogger } from '../logger';

const log = createLogger('gitdb');
// bridges gitdb's message-first logger contract into the structured pino logger
const gitDbLogger = createGitDbLogger('gitdb');

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
  log.info(
    {
      repository: redactUrl(config.repositoryUrl),
      branch: config.branch,
      authMode: config.authMode,
      syncPollSeconds: config.syncPollSeconds,
      syncMode: config.syncMode,
    },
    'gitdb starting',
  );

  const client = createClient(config.authorName, config.authorEmail);
  await client.ready();
  instance = client;

  log.info('gitdb ready');
}

function createClient(authorName: string, authorEmail: string): GitDB {
  const config = requireRepositoryConfig();
  const { authUsername, authToken } = resolveAuthCredentials(config);
  return gitDb(config.repositoryUrl, {
    gitUserName: authorName,
    gitUserEmail: authorEmail,
    syncPollSeconds: config.syncPollSeconds,
    syncMode: config.syncMode,
    dataPath: config.dataPath,
    authUsername,
    authToken,
    logger: gitDbLogger,
  });
}

export function getGitDb(): GitDB {
  if (!instance) {
    const config = requireRepositoryConfig();
    instance = createClient(config.authorName, config.authorEmail);
  }

  const actor = getCurrentActor();
  return actor ? instance.as(actor) : instance;
}