import path from 'node:path';
import type { EntityRecord, GitDBOptions, ModelOptions, ResolvedGitDBOptions } from '../domain/types';
import { GitRepository } from '../infrastructure/git-repository';
import { GitDBModel } from './model';

function resolveOptions(options: GitDBOptions): ResolvedGitDBOptions {
  return {
    repositoryPath: options.repositoryPath ?? path.resolve(process.cwd(), '.gitdb'),
    autoCommitIntervalMs: options.autoCommitIntervalMs ?? 60_000,
    immediateCommitDelayMs: options.immediateCommitDelayMs ?? 800,
    gitUserName: options.gitUserName ?? 'gitdb-bot',
    gitUserEmail: options.gitUserEmail ?? 'gitdb-bot@local',
  };
}

export class GitDB {
  private readonly models = new Map<string, GitDBModel<any>>();

  private constructor(
    private readonly repositoryPath: string,
    private readonly repository: GitRepository,
  ) {}

  static async create(options: GitDBOptions = {}): Promise<GitDB> {
    const config = resolveOptions(options);

    const repository = new GitRepository(config);
    await repository.initialize();

    return new GitDB(config.repositoryPath, repository);
  }

  model<T extends EntityRecord>(entityName: string, options: ModelOptions = {}): GitDBModel<T> {
    const key = entityName.toLowerCase();
    const cached = this.models.get(key);
    if (cached) {
      return cached as unknown as GitDBModel<T>;
    }

    const model = new GitDBModel<T>(
      this.repository,
      this.repositoryPath,
      key,
      options.idField ?? 'id',
    );

    this.models.set(key, model as GitDBModel<any>);
    return model;
  }

  async commitNow(reason?: string): Promise<void> {
    await this.repository.commitNow(reason);
  }

  async close(): Promise<void> {
    await this.repository.shutdown();
  }
}

export async function createGitDB(options: GitDBOptions = {}): Promise<GitDB> {
  return GitDB.create(options);
}
