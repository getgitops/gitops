import type { DatabaseClient } from '$lib/database/types';
import type { Project } from '../../domain/entities';
import type { ProjectRepository } from '../../domain/repositories';

type ProjectRow = {
  id: string;
  name: string;
  created_at?: string;
};

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: DatabaseClient) {}

  list(): Project[] {
    const rows = this.db.all<ProjectRow>('SELECT * FROM projects ORDER BY created_at DESC');
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    }));
  }

  upsertIfMissing(project: { id: string; name: string }): void {
    this.db.run('INSERT INTO projects (id, name) VALUES (@id, @name) ON CONFLICT(id) DO NOTHING', {
      id: project.id,
      name: project.name,
    });
  }

  upsertManyIfMissing(projects: Array<{ id: string; name: string }>): void {
    if (!projects.length) {
      return;
    }

    this.db.transaction(() => {
      for (const project of projects) {
        this.upsertIfMissing(project);
      }
    });
  }
}
