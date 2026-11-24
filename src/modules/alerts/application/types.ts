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

/** External email recipients as the alerts module sees them (`$modules/notifications`). */
export interface ExternalRecipientsPort {
  /** Normalized valid addresses, and `<input index>` → `invalid_email` | `domain_not_allowed`. */
  check(
    organizationId: string,
    emails: readonly unknown[],
  ): Promise<{ emails: string[]; errors: Record<number, string> }>;
  /** Creates the missing addresses as pending and sends their confirmation email. */
  register(organizationId: string, emails: readonly string[], actorUserId: string): Promise<void>;
  /** The addresses that may get an email now, each with its unsubscribe link. */
  deliverable(
    organizationId: string,
    emails: readonly string[],
  ): Promise<Array<{ email: string; unsubscribeUrl: string }>>;
  /** `pending` | `verified` | `unsubscribed` | `blocked` | `missing` per address. */
  statuses(organizationId: string, emails: readonly string[]): Promise<Map<string, string>>;
}

/** A notification channel an alert may use, as the alerts module sees it. */
export type UsableChannel = {
  id: string;
  name: string;
  type: string;
  scope: 'organization' | 'project';
  enabled: boolean;
};

/** Notification channels (chat, webhooks) as the alerts module sees them. */
export interface NotificationChannelsPort {
  /** Channels an alert of `location` may use: its project's and its organization's. */
  listUsable(location: {
    organizationId: string;
    projectId: string | null;
  }): Promise<UsableChannel[]>;
  /** Queues one message for the channel; `false` when it was skipped or definitively failed. */
  deliver(
    channelId: string,
    message: import('#lib/server/infra/notifications/chat-notification').ChannelMessage,
    context?: Record<string, unknown>,
  ): Promise<boolean>;
}

/**
 * Who creates or edits an alert; `canRead` checks any grant in a context for that actor (named
 * after its first use, the anti-escalation read check).
 */
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
