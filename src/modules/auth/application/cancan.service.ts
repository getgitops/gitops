import type { PermissionGrant } from '$lib/permissions';
import type { ProjectDomain } from '../../projects/domain/project.domain';
import type { RoleDomain } from '../domain/role.domain';
import type { UserDomain } from '../domain/user.domain';
import type { UserAccessDomain } from '../domain/user-access.domain';

type PermissionRole = {
  slug?: string | null;
  scope?: 'cluster' | 'organization' | 'project' | null;
  organizationId?: string | null;
  permissions?: readonly string[] | null;
} | null;

type PermissionAwareUser =
  | {
      id?: string;
      role?: PermissionRole;
    }
  | null
  | undefined;

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

  async can(userId: string, permission: PermissionGrant, context: CanCanContext): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) return false;

    return this.canForUser(user, permission, context);
  }

  async canSessionUser(
    user: PermissionAwareUser,
    permission: PermissionGrant,
    context: CanCanContext,
  ): Promise<boolean> {
    if (!user?.id) return false;
    const role = user.role ?? null;
    if (this.isClusterAdmin(role)) return true;

    if (context.scope === 'cluster') {
      return this.roleCan(role, permission);
    }

    return this.can(user.id, permission, context);
  }

  async canManageOrganization(user: PermissionAwareUser, organizationId: string): Promise<boolean> {
    return this.canSessionUser(user, 'stateiac:read', { scope: 'organization', organizationId });
  }

  async canManageProject(
    user: PermissionAwareUser,
    projectId: string,
    organizationId?: string,
  ): Promise<boolean> {
    return this.canSessionUser(user, 'project:project:read', {
      scope: 'project',
      projectId,
      organizationId,
    });
  }

  // organizationIds this user is a member of, directly or via a project under that organization.
  // returns null for a cluster admin, meaning "no restriction, sees every organization".
  async organizationIdsForUser(user: PermissionAwareUser): Promise<string[] | null> {
    if (!user?.id) return [];
    if (this.isClusterAdmin(user.role ?? null)) return null;

    const access = await this.userAccessRepository.findByUserId(user.id);
    const organizationIds = new Set<string>();

    for (const entry of access) {
      if (entry.scope === 'organization' && entry.organizationId) {
        organizationIds.add(entry.organizationId);
      } else if (entry.scope === 'project' && entry.project?.organization?.id) {
        organizationIds.add(entry.project.organization.id);
      }
    }

    return Array.from(organizationIds);
  }

  canAccessAdminArea(user: PermissionAwareUser): boolean {
    return this.isAdmin(user);
  }

  isAdmin(user: PermissionAwareUser): boolean {
    return this.isAdminRole(user?.role ?? null);
  }

  async canForUser(
    user: UserDomain,
    permission: PermissionGrant,
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

  private roleCan(role: PermissionRole, permission: PermissionGrant): boolean {
    if (!role) return false;
    if (this.isAdminRole(role)) return true;
    return CanCanService.hasPermission(role.permissions, permission);
  }

  private isClusterAdmin(role: PermissionRole): boolean {
    return role?.scope === 'cluster' && this.isAdminRole(role);
  }

  private isAdminRole(role: PermissionRole): boolean {
    if (!role?.slug) return false;
    return role.slug === 'admin' || role.slug.endsWith('-admin');
  }

  static hasPermission(
    grants: readonly string[] | null | undefined,
    permission: PermissionGrant,
  ): boolean {
    if (!grants || grants.length === 0) return false;

    const [section] = permission.split(':') as [string, string];
    return grants.some(
      (grant) =>
        grant === permission ||
        grant === `${section}:all` ||
        grant.endsWith(`:${permission}`) ||
        grant.endsWith(`:${section}:all`),
    );
  }

  private async findProjectOrganizationId(projectId: string): Promise<string | null> {
    if (!this.projectLookup) return null;
    const project = await this.projectLookup.getProject(projectId);
    return project?.organization?.id ?? null;
  }
}
