import type { FieldReference } from '#lib/events/catalog';
import type { AlertLocation } from '../domain/alert.domain';
import type {
  AlertActor,
  AlertDirectory,
  NameIds,
  ReferenceOption,
  ResolvedNames,
  ScopeMember,
  ScopeRole,
} from './types';

type Scoped<T> = T & { organizationId: string; projectId?: string | null };

/**
 * In-memory `AlertDirectory` for unit tests. Entries carry the organization (and project) they
 * belong to; a location sees its organization's entries and, for a project, only that project's.
 */
export class FakeAlertDirectory implements AlertDirectory {
  members: Scoped<ScopeMember>[] = [];
  roles: Scoped<ScopeRole>[] = [];
  references: Array<Scoped<ReferenceOption & { reference: FieldReference }>> = [];
  users: Omit<ScopeMember, 'roleIds'>[] = [];
  names: Record<string, string> = {};

  private within(
    entry: { organizationId: string; projectId?: string | null },
    location: AlertLocation,
  ) {
    if (entry.organizationId !== location.organizationId) return false;
    if (location.scope === 'organization') return true;
    return !entry.projectId || entry.projectId === location.projectId;
  }

  async listMembers(location: AlertLocation): Promise<ScopeMember[]> {
    return this.members
      .filter((member) => this.within(member, location))
      .map(({ organizationId: _o, projectId: _p, ...member }) => member);
  }

  async listRoles(location: AlertLocation): Promise<ScopeRole[]> {
    return this.roles
      .filter((role) => this.within(role, location))
      .map((role) => ({ id: role.id, name: role.name }));
  }

  async listReferences(
    reference: FieldReference,
    location: AlertLocation,
  ): Promise<ReferenceOption[]> {
    return this.references
      .filter((entry) => entry.reference === reference && this.within(entry, location))
      .map((entry) => ({ id: entry.id, label: entry.label }));
  }

  async findUser(userId: string) {
    return this.users.find((user) => user.userId === userId) ?? null;
  }

  async resolveNames(ids: NameIds): Promise<ResolvedNames> {
    const names: ResolvedNames = {};
    if (ids.organizationId && this.names[ids.organizationId])
      names.organization = this.names[ids.organizationId];
    if (ids.projectId && this.names[ids.projectId]) names.project = this.names[ids.projectId];
    if (ids.roleId && this.names[ids.roleId]) names.role = this.names[ids.roleId];
    return names;
  }
}

/** An actor allowed to read everything, or only the grants listed. */
export function actor(userId = 'author', allowed: string[] | 'all' = 'all'): AlertActor {
  return {
    userId,
    canRead: async (permission) => allowed === 'all' || allowed.includes(permission),
  };
}
