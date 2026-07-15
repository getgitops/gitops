export type GitDbOptions = {
  repositoryUrl: string;
  autoCommitIntervalMs?: number;
  immediateCommitDelayMs?: number;
  gitUserName?: string;
  gitUserEmail?: string;
  logger?: import('./infrastructure/logger.ts').GitDbLoggerLike;
};

