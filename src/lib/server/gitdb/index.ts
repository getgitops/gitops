import { env } from '$env/dynamic/private';
import { gitDb, type GitDB } from '@getgitops/gitdb';

let instance: GitDB | null = null;

function resolveRepositoryUrl(): string {
    if(!env.GITDB_REPOSITORY_URL) {
        throw new Error('GITDB_REPOSITORY_URL is not set. Please set it in your environment variables.');
    }
  return env.GITDB_REPOSITORY_URL;
}

export function getGitDb(): GitDB {
  if (instance) {
    return instance;
  }


  instance = gitDb(resolveRepositoryUrl(), {
    gitUserName: env.GITDB_AUTHOR_NAME ?? 'gitvault-suite',
    gitUserEmail: env.GITDB_AUTHOR_EMAIL ?? 'gitvault-suite@getgitops.local'
  });

  console.info('[gitdb] initialized');
  return instance;
}