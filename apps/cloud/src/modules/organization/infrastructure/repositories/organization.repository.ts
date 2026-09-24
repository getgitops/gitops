import { Repository } from '$lib/server/infra/repository';
import { OrganizationDomain } from '../../domain/organization.domain';
import { OrganizationEntity } from '$lib/database/schemas';

export class OrganizationRepository extends Repository {
  async findAll(): Promise<OrganizationDomain[]> {
    const result = await this.db.select().from(OrganizationEntity).orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new OrganizationDomain(row));
  }

  async findById(id: string): Promise<OrganizationDomain | null> {
    const result = await this.db.select().from(OrganizationEntity).where({ id }).limit(1);
    const row = result.rows[0];
    return row ? new OrganizationDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<OrganizationDomain | null> {
    const result = await this.db.select().from(OrganizationEntity).where({ slug }).limit(1);
    const row = result.rows[0];
    return row ? new OrganizationDomain(row) : null;
  }

  async create(input: {
    id: string;
    slug: string;
    name: string;
    description?: string;
  }): Promise<void> {
    await this.db.insert(OrganizationEntity).values({
      id: input.id,
      slug: input.slug,
      name: input.name,
      description: input.description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async update(
    id: string,
    changes: { name?: string; slug?: string; description?: string },
  ): Promise<void> {
    await this.db
      .update(OrganizationEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(OrganizationEntity).where({ id });
  }
}
