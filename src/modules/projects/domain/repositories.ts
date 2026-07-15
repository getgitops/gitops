import type { Project } from './entities';

export interface ProjectRepository {
  list(): Project[];
  upsertIfMissing(project: { id: string; name: string }): void;
  upsertManyIfMissing(projects: Array<{ id: string; name: string }>): void;
}
