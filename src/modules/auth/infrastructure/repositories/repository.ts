import { getGitDb } from '$lib/server/gitdb';
export class Repository {
  protected readonly db = getGitDb();

  protected toDomain(row: any): any {
    return row;
  }

  protected toJSON(row: any): any {
    return row;
  }
}
