import { Domain } from '$lib/server/domain/domain';

export class OrganizationDomain extends Domain {
  public name: string = '';
  public slug: string = '';
  public description?: string | null = null;

  constructor(data: any) {
    super(data);
    this.name = data.name;
    this.slug = data.slug;
    this.description = data.description;
  }

  toJson() {
    return {
      id: this.id,
      name: this.name,
      slug: this.slug,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
