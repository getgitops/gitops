import { GitRepository } from '../infrastructure/git-repository.ts';
import { GitDbLogger } from '../infrastructure/logger.ts';
import type { GitDbOptions } from '../types.ts';
import { SelectQuery } from '../queries/select-query.ts';

export class GitDB {
  private readonly repository: GitRepository;

  constructor(repository: GitRepository) {
    this.repository = repository;
  }

  async close(): Promise<void> {
    await this.repository.shutdown();
  }

  select(): SelectQuery {
    return new SelectQuery();
  }
}

export function gitDb(repositoryUrl: string, options: Partial<Omit<GitDbOptions, 'repositoryUrl'>> = {}): GitDB {
  const logger = new GitDbLogger(options.logger);

  const repository = new GitRepository({
    repositoryUrl,
    autoCommitIntervalMs: options.autoCommitIntervalMs ?? 60_000,
    immediateCommitDelayMs: options.immediateCommitDelayMs ?? 800,
    gitUserName: options.gitUserName ?? 'gitdb-bot',
    gitUserEmail: options.gitUserEmail ?? 'gitdb-bot@local',
    logger: options.logger ?? logger,
  });

  void repository.initialize();

  return new GitDB(repository);
}
