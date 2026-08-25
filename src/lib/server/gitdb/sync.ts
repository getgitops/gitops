import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildAuthenticatedUrl,
  readRepositoryConfig,
  redactUrl,
  type GitDbRepositoryConfig,
} from './config';

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

const REPO_PATH = path.resolve(process.cwd(), '.gitdb');

/** Network commands need a longer budget than local plumbing. */
const NETWORK_COMMANDS = new Set(['clone', 'fetch', 'push', 'pull']);
const NETWORK_TIMEOUT_MS = 120_000;
const LOCAL_TIMEOUT_MS = 30_000;

type ChangeSummary = { added: number; updated: number; removed: number };

function parseNameStatus(output: string): ChangeSummary {
  const summary: ChangeSummary = { added: 0, updated: 0, removed: 0 };

  for (const line of output.split('\n')) {
    const status = line.trim().charAt(0);
    if (status === 'A' || status === 'C') summary.added += 1;
    else if (status === 'D') summary.removed += 1;
    else if (status === 'M' || status === 'R' || status === 'T') summary.updated += 1;
  }

  return summary;
}

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
  private lastCommit: string | null = null;
  private ahead = 0;
  private behind = 0;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  getStatus(): SyncStatus {
    const config = readRepositoryConfig();
    const state = config ? this.state : 'unconfigured';

    return {
      state,
      label: STATE_LABELS[state],
      repositoryUrl: config ? redactUrl(config.repositoryUrl) : null,
      branch: config?.branch ?? null,
      syncPollSeconds: config?.syncPollSeconds ?? null,
      lastSyncAt: this.lastSyncAt,
      lastAttemptAt: this.lastAttemptAt,
      lastError: this.lastError,
      lastCommit: this.lastCommit,
      ahead: this.ahead,
      behind: this.behind,
    };
  }

  /** Restarts the poll timer using the currently persisted interval. */
  schedule(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const config = readRepositoryConfig();
    if (!config) return;

    if (this.state === 'unconfigured') {
      this.state = 'synced';
    }

    this.timer = setInterval(() => {
      void this.syncNow().catch(() => {
        // Poll failures are already reflected in the status, never crash the tick.
      });
    }, config.syncPollSeconds * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async syncNow(): Promise<SyncStatus> {
    if (this.running) {
      await this.running;
      return this.getStatus();
    }

    const config = readRepositoryConfig();
    if (!config) {
      this.state = 'unconfigured';
      return this.getStatus();
    }

    this.running = this.run(config);
    try {
      await this.running;
    } finally {
      this.running = null;
    }

    return this.getStatus();
  }

  private async run(config: GitDbRepositoryConfig): Promise<void> {
    this.state = 'syncing';
    this.lastAttemptAt = new Date().toISOString();

    try {
      const remote = buildAuthenticatedUrl(config);
      await this.ensureCloned(config, remote);

      const previousHead = (
        await this.git(['rev-parse', '--verify', 'HEAD'], { allowFailure: true })
      ).stdout.trim();

      await this.git(['add', '-A']);
      const hasChanges =
        (await this.git(['diff', '--cached', '--quiet'], { allowFailure: true })).code !== 0;
      if (hasChanges) {
        await this.git(['commit', '-m', `gitdb: sync @ ${new Date().toISOString()}`]);
      }

      const fetched = await this.git(['fetch', remote, config.branch], { allowFailure: true });
      if (fetched.code === 0) {
        await this.git(['rebase', 'FETCH_HEAD']);
      }

      const head = await this.git(['rev-parse', '--verify', 'HEAD'], { allowFailure: true });
      if (head.code === 0) {
        await this.git(['push', remote, `HEAD:refs/heads/${config.branch}`]);
        this.lastCommit = (await this.git(['rev-parse', '--short', 'HEAD'])).stdout.trim();
      }

      const counts = await this.git(['rev-list', '--left-right', '--count', 'FETCH_HEAD...HEAD'], {
        allowFailure: true,
      });
      const [behind, ahead] = counts.stdout.trim().split(/\s+/).map(Number);
      this.behind = Number.isFinite(behind) ? behind : 0;
      this.ahead = Number.isFinite(ahead) ? ahead : 0;

      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
      this.state = 'synced';

      await this.logSummary(previousHead, head.stdout.trim());
    } catch (error: unknown) {
      this.state = 'error';
      this.lastError = redactUrl(error instanceof Error ? error.message : 'Unknown sync error');
      console.error(`[gitdb-sync] sync failed: ${this.lastError}`);
    }
  }

  /** Only reports syncs that actually moved HEAD, to keep the poll quiet. */
  private async logSummary(previousHead: string, currentHead: string): Promise<void> {
    if (!currentHead || previousHead === currentHead) return;

    const range = previousHead ? [previousHead, currentHead] : ['--root', currentHead];
    const diff = await this.git(['diff', '--name-status', ...range], { allowFailure: true });
    const { added, updated, removed } = parseNameStatus(diff.stdout);

    console.info(
      `[gitdb-sync] synced ${this.lastCommit ?? currentHead.slice(0, 7)} — ` +
        `${added} added, ${updated} updated, ${removed} removed`,
    );
  }

  /**
   * Clones the repository into `.gitdb/` and writes the GitDB manifest.
   * The persisted `origin` never carries credentials: every authenticated command
   * receives the remote URL as an argv value instead.
   */
  async ensureCloned(
    config: GitDbRepositoryConfig,
    remote = buildAuthenticatedUrl(config),
  ): Promise<void> {
    const gitDir = path.join(REPO_PATH, '.git');

    if (existsSync(gitDir)) {
      const origin = await this.git(['remote', 'get-url', 'origin'], { allowFailure: true });
      // pointing at another repository would push cluster state to the wrong remote
      if (origin.stdout.trim() !== config.repositoryUrl) {
        rmSync(REPO_PATH, { recursive: true, force: true });
      }
    }

    if (!existsSync(gitDir)) {
      const isEmptyTarget = !existsSync(REPO_PATH) || readdirSync(REPO_PATH).length === 0;

      if (isEmptyTarget) {
        console.info(`[gitdb-sync] cloning ${redactUrl(config.repositoryUrl)} into .gitdb`);
        rmSync(REPO_PATH, { recursive: true, force: true });
        await this.git(['clone', remote, REPO_PATH], { cwd: process.cwd() });
      } else {
        // the directory already holds local state, so adopt it instead of wiping it
        mkdirSync(REPO_PATH, { recursive: true });
        await this.git(['init']);
        await this.git(['symbolic-ref', 'HEAD', `refs/heads/${config.branch}`]);
        const fetched = await this.git(['fetch', remote, config.branch], { allowFailure: true });
        if (fetched.code === 0) {
          await this.git(['reset', '--mixed', 'FETCH_HEAD']);
        }
      }
    }

    await this.git(['remote', 'remove', 'origin'], { allowFailure: true });
    await this.git(['remote', 'add', 'origin', config.repositoryUrl]);
    await this.git(['config', 'user.name', config.authorName]);
    await this.git(['config', 'user.email', config.authorEmail]);

    this.writeManifest(config);
  }

  /** Keeps `.gitdb/gitdb.manifest.json` in sync with the active repository configuration. */
  private writeManifest(config: GitDbRepositoryConfig): void {
    const manifestPath = path.join(REPO_PATH, 'gitdb.manifest.json');

    let existing: Record<string, unknown> = {};
    if (existsSync(manifestPath)) {
      try {
        existing = JSON.parse(readFileSync(manifestPath, 'utf8'));
      } catch {
        // a corrupted manifest is simply rewritten from the current configuration
      }
    }

    const manifest = {
      kind: 'gitdb',
      repositoryUrl: config.repositoryUrl,
      branch: config.branch,
      authorName: config.authorName,
      authorEmail: config.authorEmail,
      syncPollSeconds: config.syncPollSeconds,
      createdAt: (existing.createdAt as string) ?? new Date().toISOString(),
    };

    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
    if (serialized === `${JSON.stringify(existing, null, 2)}\n`) return;

    writeFileSync(manifestPath, serialized, 'utf8');
  }

  private git(
    args: string[],
    options: { allowFailure?: boolean; cwd?: string } = {},
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const timeoutMs = NETWORK_COMMANDS.has(args[0]) ? NETWORK_TIMEOUT_MS : LOCAL_TIMEOUT_MS;

      const child = spawn('git', args, {
        cwd: options.cwd ?? REPO_PATH,
        stdio: 'pipe',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const exitCode = code ?? 1;

        if (timedOut) {
          reject(new Error(`git ${args[0]} timed out after ${timeoutMs / 1000}s`));
          return;
        }

        if (exitCode !== 0 && !options.allowFailure) {
          // args may contain a credential-bearing remote, so only the command name is reported
          reject(
            new Error(
              redactUrl(`git ${args[0]} failed: ${stderr.trim() || `exit code ${exitCode}`}`),
            ),
          );
          return;
        }

        resolve({ code: exitCode, stdout, stderr });
      });
    });
  }
}

export const gitDbSyncService = new GitDbSyncService();
