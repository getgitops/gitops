import { getGitDb } from '$lib/server/gitdb';
export class Repository {
  // resolved on access so repositories can be instantiated before the repo is configured
  protected get db() {
    return getGitDb();
  }

  protected toDomain(row: any): any {
    return row;
  }

  protected toJSON(row: any): any {
    return row;
  }
}
