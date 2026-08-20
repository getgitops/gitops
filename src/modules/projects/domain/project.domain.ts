import { Domain } from '$lib/server/domain/domain';

export interface ProjectStatus {
  ACTIVE: 'active';
  INACTIVE: 'inactive';
}

export interface ProjectModules {
  vault: boolean;
  openreport: boolean;
  stateiac: boolean;
}

export const DEFAULT_PROJECT_MODULES: ProjectModules = {
  vault: true,
  openreport: true,
  stateiac: true,
};

export class ProjectDomain extends Domain {
  public name: string = '';
  public slug: string | null = null;
  public description?: string | null = null;
  public status: ProjectStatus[keyof ProjectStatus] = 'active';
  public modules: ProjectModules = { ...DEFAULT_PROJECT_MODULES };
  constructor(data: any) {
    super(data);
    this.name = data.name;
    this.slug = data.slug;
    this.description = data.description;
    this.status = data.status;
    this.modules = { ...DEFAULT_PROJECT_MODULES, ...(data.modules ?? {}) };
  }

  toJson() {
    return {
      id: this.id,
      name: this.name,
      slug: this.slug,
      description: this.description,
      createdAt: this.createdAt,
      status: this.status,
      modules: this.modules,
      updatedAt: this.updatedAt,
    };
  }
}
