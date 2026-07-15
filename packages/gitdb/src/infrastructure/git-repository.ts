import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedGitDBOptions } from '../domain/types';

export class GitRepository {
  private readonly repoPath: string;
  private readonly autoCommitIntervalMs: number;
  private readonly immediateCommitDelayMs: number;
  private readonly gitUserName: string;
  private readonly gitUserEmail: string;

  private hasPendingCommit = false;
  private pendingReasons = new Set<string>();
  private commitTimer: NodeJS.Timeout | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private commitQueue: Promise<void> = Promise.resolve();

  constructor(options: ResolvedGitDBOptions) {
    this.repoPath = options.repositoryPath;
    this.autoCommitIntervalMs = options.autoCommitIntervalMs;
    this.immediateCommitDelayMs = options.immediateCommitDelayMs;
    this.gitUserName = options.gitUserName;
    this.gitUserEmail = options.gitUserEmail;
  }

  async initialize(): Promise<void> {
    if (!existsSync(this.repoPath)) {
      await mkdir(this.repoPath, { recursive: true });
    }

    if (!existsSync(path.join(this.repoPath, '.git'))) {
      await this.runGit(['init']);
    }

    await this.runGit(['config', 'user.name', this.gitUserName]);
    await this.runGit(['config', 'user.email', this.gitUserEmail]);

    this.intervalTimer = setInterval(() => {
      void this.commitNow('auto-interval');
    }, this.autoCommitIntervalMs);
  }

  queueBackgroundCommit(reason: string): void {
    this.hasPendingCommit = true;
    this.pendingReasons.add(reason);

    if (this.commitTimer) {
      return;
    }

    this.commitTimer = setTimeout(() => {
      this.commitTimer = null;
      void this.commitNow('auto-background');
    }, this.immediateCommitDelayMs);
  }

  async commitNow(reason = 'manual'): Promise<void> {
    this.pendingReasons.add(reason);

    this.commitQueue = this.commitQueue.then(async () => {
      const reasons = Array.from(this.pendingReasons);
      this.pendingReasons.clear();

      await this.runGit(['add', '-A']);

      const hasChanges = await this.hasStagedChanges();
      if (!hasChanges) {
        this.hasPendingCommit = false;
        return;
      }

      const message = `gitdb: ${reasons.join(', ') || 'update'} @ ${new Date().toISOString()}`;
      await this.runGit(['commit', '-m', message]);
      this.hasPendingCommit = false;
    });

    return this.commitQueue;
  }

  async shutdown(): Promise<void> {
    if (this.commitTimer) {
      clearTimeout(this.commitTimer);
      this.commitTimer = null;
    }

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    if (this.hasPendingCommit || this.pendingReasons.size > 0) {
      await this.commitNow('shutdown');
    }
  }

  private async hasStagedChanges(): Promise<boolean> {
    const result = await this.runGit(['diff', '--cached', '--quiet'], true);
    return result !== 0;
  }

  private runGit(args: string[], allowFailure = false): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd: this.repoPath,
        stdio: 'pipe',
      });

      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', reject);

      child.on('close', (code) => {
        const exitCode = code ?? 1;
        if (!allowFailure && exitCode !== 0) {
          reject(new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`));
          return;
        }

        resolve(exitCode);
      });
    });
  }
}
