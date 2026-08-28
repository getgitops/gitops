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

  // coarse organization-scope membership check: gates the /settings area shell and nav visibility.
  // does not cascade from project access — per-page/action checks decide what's actually visible.
  async canManageOrganization(user: PermissionAwareUser, organizationId: string): Promise<boolean> {
    if (!user?.id) return false;
    if (this.isClusterAdmin(user.role ?? null)) return true;

    const access = await this.userAccessRepository.findByUserId(user.id);
    return access.some(
      (entry) => entry.scope === 'organization' && entry.organizationId === organizationId,
    );
  }

  // read-only visibility into an organization: same as canManageOrganization, plus a user whose
  // only access is to a project under this organization (they can see the org's overview, not
  // manage it — every org-scope action still requires an actual organization:* permission grant).
  async canViewOrganization(user: PermissionAwareUser, organizationId: string): Promise<boolean> {
    if (await this.canManageOrganization(user, organizationId)) return true;
    if (!user?.id) return false;

    const access = await this.userAccessRepository.findByUserId(user.id);
    return access.some(
      (entry) => entry.scope === 'project' && entry.project?.organization?.id === organizationId,
    );
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
    const candidates = await this.rolesForContext(access, context);

    return candidates.some(({ role, scope }) => {
      // an organization-scope role reaching into one of its own projects doesn't hold any
      // project:* grant directly (different namespace) — its authority over "this org's
      // projects" as a whole (organization:projects:<action>) carries the same action down
      // into every project resource, top-down: cluster > organization > project. Only applies
      // to the granular project:* vocabulary — legacy flat permissions (stateiac:*, vault:*)
      // are scope-agnostic by design and keep matching literally.
      if (
        context.scope === 'project' &&
        scope === 'organization' &&
        permission.startsWith('project:')
      ) {
        const action = permission.split(':').pop();
        return this.roleCan(role, `organization:projects:${action}` as PermissionGrant);
      }
      return this.roleCan(role, permission);
    });
  }

  private async rolesForContext(
    access: UserAccessDomain[],
    context: CanCanContext,
  ): Promise<{ role: RoleDomain; scope: 'organization' | 'project' }[]> {
    if (context.scope === 'organization') {
      return access
        .filter(
          (entry) =>
            entry.scope === 'organization' && entry.organizationId === context.organizationId,
        )
        .filter((entry): entry is UserAccessDomain & { role: RoleDomain } => Boolean(entry.role))
        .map((entry) => ({ role: entry.role, scope: 'organization' as const }));
    }

    if (context.scope !== 'project') return [];

    // most-specific-wins: an explicit project-level assignment for this exact project is
    // authoritative on its own — it does not get supplemented (or overridden) by whatever the
    // user's organization role would otherwise allow. The organization role only cascades down
    // when the user has no project-level assignment here at all.
    const projectEntries = access.filter(
      (entry) => entry.scope === 'project' && entry.projectId === context.projectId,
    );

    if (projectEntries.length > 0) {
      return projectEntries
        .filter((entry): entry is UserAccessDomain & { role: RoleDomain } => Boolean(entry.role))
        .map((entry) => ({ role: entry.role, scope: 'project' as const }));
    }

    const organizationId =
      context.organizationId ?? (await this.findProjectOrganizationId(context.projectId));

    return access
      .filter((entry) => entry.scope === 'organization' && entry.organizationId === organizationId)
      .filter((entry): entry is UserAccessDomain & { role: RoleDomain } => Boolean(entry.role))
      .map((entry) => ({ role: entry.role, scope: 'organization' as const }));
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
    const lastColon = permission.lastIndexOf(':');
    const resourcePath = lastColon === -1 ? permission : permission.slice(0, lastColon);
    const resourceWildcard = `${resourcePath}:all`;

    return grants.some(
      (grant) =>
        grant === permission ||
        grant === `${section}:all` ||
        grant === resourceWildcard ||
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
