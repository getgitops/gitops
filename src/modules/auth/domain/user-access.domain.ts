import { Domain } from './domain';
import { OrganizationDomain } from '../../organization/domain/organization.domain';
import { ProjectDomain } from '../../projects/domain/project.domain';
import { RoleDomain, type RoleScope } from './role.domain';
import { UserDomain } from './user.domain';

export type UserAccessScope = RoleScope;
export type UserAccessStatus = 'active' | 'invited';

export class UserAccessDomain extends Domain {
  public userId: string = '';
  public roleId: string = '';
  public scope: UserAccessScope = 'cluster';
  public organizationId: string | null = null;
  public projectId: string | null = null;
  public status: UserAccessStatus = 'active';
  public user: UserDomain | null = null;
  public role: RoleDomain | null = null;
  public organization: OrganizationDomain | null = null;
  public project: ProjectDomain | null = null;

  constructor(data: any) {
    super(data);
    this.userId = data.userId;
    this.roleId = data.roleId;
    this.scope = data.scope === 'organization' || data.scope === 'project' ? data.scope : 'cluster';
    this.organizationId = data.organizationId ?? null;
    this.projectId = data.projectId ?? null;
    this.status = data.status === 'invited' ? 'invited' : 'active';
    this.user = data.user ? new UserDomain(data.user) : null;
    this.role = data.role ? new RoleDomain(data.role) : null;
    this.organization = data.organization ? new OrganizationDomain(data.organization) : null;
    this.project = data.project ? new ProjectDomain(data.project) : null;
  }

  toJson() {
    return {
      id: this.id,
      userId: this.userId,
      roleId: this.roleId,
      scope: this.scope,
      organizationId: this.organizationId,
      projectId: this.projectId,
      status: this.status,
      user: this.user ? this.user.toJson() : null,
      role: this.role ? this.role.toJson() : null,
      organization: this.organization ? this.organization.toJson() : null,
      project: this.project ? this.project.toJson() : null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
