import type { Project } from '../domain/entities';
import type { ProjectRepository } from '../domain/repositories';

export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  listProjects(): Project[] {
    return this.repository.list();
  }

  createProject(name: string): Project {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error('Project name is required');
    }

    const id = normalizedName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    this.repository.upsertIfMissing({ id, name: normalizedName });

    return { id, name: normalizedName };
  }

  syncFromPulumiStateKeys(keys: string[]): number {
    const projects = new Set<string>();

    for (const key of keys) {
      let id = key;
      if (id.startsWith('.pulumi/stacks/')) {
        id = id.replace('.pulumi/stacks/', '');
      }
      if (id.endsWith('.json')) {
        id = id.slice(0, -5);
      }

      const parts = id.split('/');
      projects.add(parts.length > 1 ? parts[0] : 'default');
    }

    this.repository.upsertManyIfMissing(
      Array.from(projects).map((project) => ({
        id: project,
        name: project,
      })),
    );

    return projects.size;
  }
}
