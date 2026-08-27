import { readRepositoryConfig, redactUrl } from './config';
import { getGitDb } from './index';

export type SyncState = 'synced' | 'syncing' | 'error' | 'unconfigured';

export type SyncStatus = {
  state: SyncState;
  label: string;
  repositoryUrl: string | null;
  branch: string | null;
  syncPollSeconds: number | null;
  lastSyncAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastCommit: string | null;
  ahead: number;
  behind: number;
};

const STATE_LABELS: Record<SyncState, string> = {
  synced: 'All sync',
  syncing: 'Sync in progress',
  error: 'Error in sync',
  unconfigured: 'Repository not configured',
};

class GitDbSyncService {
  private state: SyncState = 'unconfigured';
  private lastSyncAt: string | null = null;
  private lastAttemptAt: string | null = null;
  private lastError: string | null = null;
  private running: Promise<SyncStatus> | null = null;

  async getStatus(): Promise<SyncStatus> {
    const config = readRepositoryConfig();
    if (!config) {
      this.state = 'unconfigured';
      return {
        state: 'unconfigured',
        label: STATE_LABELS.unconfigured,
        repositoryUrl: null,
        branch: null,
        syncPollSeconds: null,
        lastSyncAt: this.lastSyncAt,
        lastAttemptAt: this.lastAttemptAt,
        lastError: this.lastError,
        lastCommit: null,
        ahead: 0,
        behind: 0,
      };
    }

    let ahead = 0;
    try {
      const db = getGitDb();
      ahead = await db.getPendingCommits();
      await db.isSynced();
    } catch {
      // transient status query error
    }

    if (this.state === 'unconfigured') {
      this.state = 'synced';
    }

    const state = this.state;

    return {
      state,
      label: STATE_LABELS[state],
      repositoryUrl: redactUrl(config.repositoryUrl),
      branch: config.branch,
      syncPollSeconds: config.syncPollSeconds,
      lastSyncAt: this.lastSyncAt,
      lastAttemptAt: this.lastAttemptAt,
      lastError: this.lastError,
      lastCommit: null,
      ahead,
      behind: 0,
    };
  }

  async syncNow(): Promise<SyncStatus> {
    if (this.running) {
      return this.running;
    }

    const config = readRepositoryConfig();
    if (!config) {
      this.state = 'unconfigured';
      return this.getStatus();
    }

    this.running = this.run();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  private async run(): Promise<SyncStatus> {
    this.state = 'syncing';
    this.lastAttemptAt = new Date().toISOString();

    try {
      const db = getGitDb();
      await db.sync();
      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
      this.state = 'synced';
    } catch (error: unknown) {
      this.state = 'error';
      this.lastError = redactUrl(error instanceof Error ? error.message : 'Unknown sync error');
      console.error(`[gitdb-sync] sync failed: ${this.lastError}`);
    }

    return this.getStatus();
  }
}

export const gitDbSyncService = new GitDbSyncService();
