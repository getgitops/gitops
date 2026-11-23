import type { FieldReference } from '#lib/events/catalog';
import type { PermissionGrant } from '#lib/permissions';
import type { AlertLocation } from '../domain/alert.domain';

/** Same shape as `CanCanContext` in `#modules/auth`, without importing it. */
export type PermissionContext =
  | { scope: 'organization'; organizationId: string }
  | { scope: 'project'; projectId: string; organizationId?: string };

/** Permission check for an arbitrary user (`cancanService.can`). */
export type UserPermissionCheck = (
  userId: string,
  permission: PermissionGrant,
  context: PermissionContext,
) => Promise<boolean>;

/** Someone with access to the alert's organization or project. */
export type ScopeMember = {
  userId: string;
  username: string;
  email: string | null;
  disabled: boolean;
  /** Roles held in the alert's scope (and, for a project, in its organization). */
  roleIds: string[];
};

export type ScopeRole = { id: string; name: string };

/** Entity selectable in a `reference` condition. */
export type ReferenceOption = { id: string; label: string };

/** Read-only view of the platform the alerts module needs; wired in `index.ts`. */
export interface AlertDirectory {
  /** Active members: organization members and members of its projects, or a project's members
   * and the members of its organization. */
  listMembers(location: AlertLocation): Promise<ScopeMember[]>;
  /** Roles a recipient can be picked by: the organization's roles, plus the project's roles for a
   * project alert. */
  listRoles(location: AlertLocation): Promise<ScopeRole[]>;
  /** Entities of `reference` inside the location: a condition can only point at these. */
  listReferences(reference: FieldReference, location: AlertLocation): Promise<ReferenceOption[]>;
  /** Any user, member or not (system notifications reach users who just lost their access). */
  findUser(userId: string): Promise<Omit<ScopeMember, 'roleIds'> | null>;
  /** Display names for a system notification; unknown ids are left out. */
  resolveNames(ids: NameIds): Promise<ResolvedNames>;
}

export type NameIds = {
  organizationId?: string | null;
  projectId?: string | null;
  roleId?: string | null;
};

export type ResolvedNames = {
  organization?: string;
  organizationSlug?: string;
  project?: string;
  projectSlug?: string;
  role?: string;
};

/** Who creates or edits an alert; `canRead` checks a grant in a context for that actor. */
export type AlertActor = {
  userId: string;
  canRead(permission: PermissionGrant, context: PermissionContext): Promise<boolean>;
};

export function locationContext(location: AlertLocation): PermissionContext {
  return location.scope === 'project' && location.projectId
    ? { scope: 'project', projectId: location.projectId, organizationId: location.organizationId }
    : { scope: 'organization', organizationId: location.organizationId };
}

export function eventContext(scope: {
  organizationId?: string | null;
  projectId?: string | null;
}): PermissionContext | null {
  if (scope.projectId) {
    return {
      scope: 'project',
      projectId: scope.projectId,
      organizationId: scope.organizationId ?? undefined,
    };
  }
  if (scope.organizationId) return { scope: 'organization', organizationId: scope.organizationId };
  return null;
}
