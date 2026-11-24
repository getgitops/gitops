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
import { CachedGitDb } from './cached-client';

const log = createLogger('gitdb');
// bridges gitdb's message-first logger contract into the structured pino logger
const gitDbLogger = createGitDbLogger('gitdb');

// One client per process, on `globalThis`: in dev the server code can be evaluated by more than one
// Vite module runner (the hooks warm-up plugin and SvelteKit), and two clients on the same clone
// would keep separate caches and commit/sync timers, so a write through one stays invisible to the
// other (process-wide singletons such as the monitoring runtime read stale data). Same pattern as
// the event bus.
const GITDB_KEY = Symbol.for('gitops.gitdb.client');
type GitDbSlot = { instance: CachedGitDb | null; startup: Promise<void> | null };
const slot: GitDbSlot = ((globalThis as typeof globalThis & { [GITDB_KEY]?: GitDbSlot })[
  GITDB_KEY
] ??= { instance: null, startup: null });

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
  if (!slot.startup) {
    slot.startup = boot().catch((error) => {
      slot.startup = null;
      throw error;
    });
  }
  return slot.startup;
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

  const client = slot.instance ?? createClient(config.authorName, config.authorEmail);
  slot.instance = client;
  try {
    await client.ready();
  } catch (error) {
    slot.instance = null;
    try {
      await client.close();
    } catch (err) {
      log.warn({ err }, 'gitdb cleanup after failed startup');
    }
    throw error;
  }

  log.info('gitdb ready');
}

function createClient(authorName: string, authorEmail: string): CachedGitDb {
  const config = requireRepositoryConfig();
  const { authUsername, authToken } = resolveAuthCredentials(config);
  const db: GitDB = gitDb(config.repositoryUrl, {
    branch: config.branch,
    gitUserName: authorName,
    gitUserEmail: authorEmail,
    syncPollSeconds: config.syncPollSeconds,
    syncMode: config.syncMode,
    dataPath: config.dataPath,
    authUsername,
    authToken,
    logger: gitDbLogger,
  });
  return new CachedGitDb(db, config.dataPath);
}

export function getGitDb(): CachedGitDb {
  if (!slot.instance) {
    const config = requireRepositoryConfig();
    slot.instance = createClient(config.authorName, config.authorEmail);
  }

  const actor = getCurrentActor();
  // only the commit identity reaches GitDB; ids in the request context are for domain events
  return actor ? slot.instance.as({ name: actor.name, email: actor.email }) : slot.instance;
}
