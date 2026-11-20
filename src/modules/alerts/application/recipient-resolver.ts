import type { PermissionGrant } from '#lib/permissions';
import type { AlertLocation, AlertRecipients } from '../domain/alert.domain';
import type { AlertDirectory, PermissionContext, ScopeMember, UserPermissionCheck } from './types';

export type Recipient = Pick<ScopeMember, 'userId' | 'username'> & { email: string };

export type ResolvedRecipients = {
  recipients: Recipient[];
  /** Selected users dropped because they can't read the event. */
  denied: string[];
};

/**
 * Turns an alert's users and roles into the people that get the email: the selected users plus
 * every member holding one of the roles, restricted to current members of the alert's location
 * that are enabled and have an email, and finally to those allowed to read the event
 * (`readPermission` checked where the event happened, most-specific-wins included).
 */
export class RecipientResolver {
  constructor(
    private readonly directory: Pick<AlertDirectory, 'listMembers'>,
    private readonly can: UserPermissionCheck,
  ) {}

  async resolve(
    location: AlertLocation,
    selection: AlertRecipients,
    readPermission: PermissionGrant,
    context: PermissionContext,
  ): Promise<ResolvedRecipients> {
    const members = await this.directory.listMembers(location);
    const userIds = new Set(selection.userIds);
    const roleIds = new Set(selection.roleIds);

    const candidates = new Map<string, Recipient>();
    for (const member of members) {
      const selected =
        userIds.has(member.userId) || member.roleIds.some((roleId) => roleIds.has(roleId));
      if (!selected || member.disabled || !member.email) continue;
      candidates.set(member.userId, {
        userId: member.userId,
        username: member.username,
        email: member.email,
      });
    }

    const recipients: Recipient[] = [];
    const denied: string[] = [];
    for (const candidate of candidates.values()) {
      const allowed = await this.can(candidate.userId, readPermission, context).catch(() => false);
      if (allowed) recipients.push(candidate);
      else denied.push(candidate.userId);
    }

    return { recipients, denied };
  }
}
