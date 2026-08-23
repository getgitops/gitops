import { Repository } from '$lib/server/infra/repository';
import { CodeReportServiceDomain } from '../../domain/code-report-service.domain';
import { CodeReportServiceEntity } from '$lib/database/schemas';

export class CodeReportServiceRepository extends Repository {
  async findAll(): Promise<CodeReportServiceDomain[]> {
    const result = await this.db
      .with({ project: true })
      .select()
      .from(CodeReportServiceEntity)
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new CodeReportServiceDomain(row));
  }

  async findByProjectId(projectId: string): Promise<CodeReportServiceDomain[]> {
    const result = await this.db
      .with({ project: true })
      .select()
      .from(CodeReportServiceEntity)
      .where({ projectId })
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new CodeReportServiceDomain(row));
  }

  async findById(id: string): Promise<CodeReportServiceDomain | null> {
    const result = await this.db
      .with({ project: true })
      .select()
      .from(CodeReportServiceEntity)
      .where({ id })
      .limit(1);
    const row = result.rows[0];
    return row ? new CodeReportServiceDomain(row) : null;
  }

  async findBySlug(projectId: string, slug: string): Promise<CodeReportServiceDomain | null> {
    const result = await this.db
      .with({ project: true })
      .select()
      .from(CodeReportServiceEntity)
      .where({ projectId, slug })
      .limit(1);
    const row = result.rows[0];
    return row ? new CodeReportServiceDomain(row) : null;
  }

  // slug is unique across the whole entity (see schema), so this looks it up regardless of project
  async findBySlugGlobal(slug: string): Promise<CodeReportServiceDomain | null> {
    const result = await this.db
      .with({ project: true })
      .select()
      .from(CodeReportServiceEntity)
      .where({ slug })
      .limit(1);
    const row = result.rows[0];
    return row ? new CodeReportServiceDomain(row) : null;
  }

  async create(input: {
    id: string;
    projectId: string;
    slug: string;
    name: string;
    description?: string;
    tags?: string[];
  }): Promise<void> {
    await this.db.insert(CodeReportServiceEntity).values({
      id: input.id,
      projectId: input.projectId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      tags: input.tags ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async update(
    id: string,
    changes: { name?: string; slug?: string; description?: string; tags?: string[] },
  ): Promise<void> {
    await this.db
      .update(CodeReportServiceEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(CodeReportServiceEntity).where({ id });
  }
}
