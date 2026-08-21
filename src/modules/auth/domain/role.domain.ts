import { Domain } from './domain';
import { OrganizationDomain } from '../../organization/domain/organization.domain';
import { ProjectDomain } from '../../projects/domain/project.domain';

export type RoleScope = 'cluster' | 'organization' | 'project';

export class RoleDomain extends Domain {
  public name: string = '';
  public slug: string = '';
  public scope: RoleScope = 'cluster';
  public organizationId: string | null = null;
  public projectId: string | null = null;
  public organization: OrganizationDomain | null = null;
  public project: ProjectDomain | null = null;
  public permissions: string[] = [];

  constructor(data: any) {
    super(data);
    this.name = data.name;
    this.slug = data.slug;
    this.scope = data.scope === 'organization' || data.scope === 'project' ? data.scope : 'cluster';
    this.organizationId = data.organizationId ?? null;
    this.projectId = data.projectId ?? null;
    this.organization = data.organization ? new OrganizationDomain(data.organization) : null;
    this.project = data.project ? new ProjectDomain(data.project) : null;
    this.permissions = Array.isArray(data.permissions) ? data.permissions : [];
  }

  toJson() {
    return {
      id: this.id,
      name: this.name,
      slug: this.slug,
      scope: this.scope,
      organizationId: this.organizationId,
      projectId: this.projectId,
      organization: this.organization ? this.organization.toJson() : null,
      project: this.project ? this.project.toJson() : null,
      permissions: this.permissions,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
