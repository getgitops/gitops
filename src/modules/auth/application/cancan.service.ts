import { hasPermission, type Permission } from '$lib/permissions';
import type { ProjectDomain } from '../../projects/domain/project.domain';
import type { RoleDomain } from '../domain/role.domain';
import type { UserDomain } from '../domain/user.domain';
import type { UserAccessDomain } from '../domain/user-access.domain';

export type CanCanContext =
  | { scope: 'cluster' }
  | { scope: 'organization'; organizationId: string }
  | { scope: 'project'; projectId: string; organizationId?: string };

type UserLookup = {
  findById(id: string): Promise<UserDomain | null>;
};

type UserAccessLookup = {
  findByUserId(userId: string): Promise<UserAccessDomain[]>;
};

type ProjectLookup = {
  getProject(id: string): Promise<ProjectDomain | any>;
};

export class CanCanService {
  constructor(
    private readonly userRepository: UserLookup,
    private readonly userAccessRepository: UserAccessLookup,
    private readonly projectLookup?: ProjectLookup,
  ) {}

  async can(userId: string, permission: Permission, context: CanCanContext): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) return false;

    return this.canForUser(user, permission, context);
  }

  async canForUser(
    user: UserDomain,
    permission: Permission,
    context: CanCanContext,
  ): Promise<boolean> {
    if (this.isClusterAdmin(user.role)) return true;

    if (context.scope === 'cluster') {
      return this.roleCan(user.role, permission);
    }

    const access = await this.userAccessRepository.findByUserId(user.id);
    const candidateRoles = await this.rolesForContext(access, context);
    return candidateRoles.some((role) => this.roleCan(role, permission));
  }

  private async rolesForContext(
    access: UserAccessDomain[],
    context: CanCanContext,
  ): Promise<RoleDomain[]> {
    if (context.scope === 'organization') {
      return access
        .filter(
          (entry) =>
            entry.scope === 'organization' && entry.organizationId === context.organizationId,
        )
        .map((entry) => entry.role)
        .filter((role): role is RoleDomain => Boolean(role));
    }

    if (context.scope !== 'project') return [];

    const organizationId =
      context.organizationId ?? (await this.findProjectOrganizationId(context.projectId));

    return access
      .filter((entry) => {
        if (entry.scope === 'project') return entry.projectId === context.projectId;
        if (entry.scope === 'organization') return entry.organizationId === organizationId;
        return false;
      })
      .map((entry) => entry.role)
      .filter((role): role is RoleDomain => Boolean(role));
  }

  private roleCan(role: RoleDomain | null, permission: Permission): boolean {
    if (!role) return false;
    if (this.isAdminRole(role)) return true;
    return hasPermission(role.permissions, permission);
  }

  private isClusterAdmin(role: RoleDomain | null): boolean {
    return role?.scope === 'cluster' && this.isAdminRole(role);
  }

  private isAdminRole(role: RoleDomain): boolean {
    return role.slug === 'admin' || role.slug.endsWith('-admin');
  }

  private async findProjectOrganizationId(projectId: string): Promise<string | null> {
    if (!this.projectLookup) return null;
    const project = await this.projectLookup.getProject(projectId);
    return project?.organization?.id ?? null;
  }
}
