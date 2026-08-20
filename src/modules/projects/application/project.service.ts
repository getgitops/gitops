
import { ProjectRepository } from '../infrastructure/repositories/project.repostitory';
import { ProjectDomain } from '../domain/project.domain';
export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  async listProjects() {
    const projects = await this.repository.findAll();
    return projects.map((project) => project.toJson());
  }



  // syncFromPulumiStateKeys(keys: string[]): number {
  //   const projects = new Set<string>();

  //   for (const key of keys) {
  //     let id = key;
  //     if (id.startsWith('.pulumi/stacks/')) {
  //       id = id.replace('.pulumi/stacks/', '');
  //     }
  //     if (id.endsWith('.json')) {
  //       id = id.slice(0, -5);
  //     }

  //     const parts = id.split('/');
  //     projects.add(parts.length > 1 ? parts[0] : 'default');
  //   }

  //   this.repository.upsertManyIfMissing(
  //     Array.from(projects).map((project) => ({
  //       id: project,
  //       name: project,
  //     })),
  //   );

  //   return projects.size;
  // }
}
