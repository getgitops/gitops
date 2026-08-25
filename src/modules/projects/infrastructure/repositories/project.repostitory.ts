import { Repository } from '$lib/server/infra/repository';
import {
  ProjectDomain,
  type ProjectModules,
  type ProjectSettings,
} from '../../domain/project.domain';
import { ProjectEntity } from '$lib/database/schemas';

export class ProjectRepository extends Repository {
  async findByName(name: string): Promise<ProjectDomain | null> {
    const role = await this.db
      .with({ organization: true })
      .select()
      .from(ProjectEntity)
      .where({ name })
      .limit(1);
    return role.rows[0] ? new ProjectDomain(role.rows[0]) : null;
  }

  async findAll(): Promise<ProjectDomain[]> {
    const result = await this.db
      .with({ organization: true })
      .select()
      .from(ProjectEntity)
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new ProjectDomain(row));
  }

  async findByOrganizationId(organizationId: string): Promise<ProjectDomain[]> {
    const result = await this.db
      .with({ organization: true })
      .select()
      .from(ProjectEntity)
      .where({ organizationId })
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new ProjectDomain(row));
  }

  async findById(id: string): Promise<ProjectDomain | null> {
    const result = await this.db
      .with({ organization: true })
      .select()
      .from(ProjectEntity)
      .where({ id })
      .limit(1);
    const row = result.rows[0];
    return row ? new ProjectDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<ProjectDomain | null> {
    const result = await this.db
      .with({ organization: true })
      .select()
      .from(ProjectEntity)
      .where({ slug })
      .limit(1);
    const row = result.rows[0];
    return row ? new ProjectDomain(row) : null;
  }

  async create(input: {
    id: string;
    organizationId: string;
    slug: string;
    name: string;
    description?: string;
    status: string;
    modules: ProjectModules;
  }): Promise<void> {
    await this.db.insert(ProjectEntity).values({
      id: input.id,
      organizationId: input.organizationId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      status: input.status,
      modules: input.modules,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async update(
    id: string,
    changes: {
      name?: string;
      slug?: string;
      description?: string;
      status?: string;
      modules?: ProjectModules;
      organizationId?: string;
      settings?: ProjectSettings;
    },
  ): Promise<void> {
    await this.db
      .update(ProjectEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async deleteById(id: string): Promise<void> {
    // TODO: Aqui deberemos borrar roles, usuarios y demás entidades relacionadas con el proyecto antes de borrarlo
    await this.db.delete(ProjectEntity).where({ id });
  }
}
