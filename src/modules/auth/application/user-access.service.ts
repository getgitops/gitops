import crypto from 'crypto';
import type { RoleScope } from '../domain/role.domain';
import type { RoleView } from '../domain/entities';
import type { UserAccessDomain, UserAccessStatus } from '../domain/user-access.domain';
import type { UserDomain } from '../domain/user.domain';
import type { RoleRepository } from '../infrastructure/repositories/role.repository';
import type { UserAccessRepository } from '../infrastructure/repositories/user-access.repository';
import type { UserRepository } from '../infrastructure/repositories/user.repository';
import type { PasswordService } from './password.service';

type UserAccessRow = {
  id: string;
  userId: string;
  username: string;
  email: string | null;
  role: ReturnType<NonNullable<UserAccessDomain['role']>['toJson']> | null;
  organizations: Array<{ id: string; name: string; slug: string; role: string | null }>;
  scope: RoleScope;
  organizationId: string | null;
  projectId: string | null;
  status: UserAccessStatus;
  createdAt: string;
};

export type InvitationNotifierPort = {
  sendInvitation(input: {
    email: string;
    username: string;
    organizationName: string;
    roleName: string;
    inviteUrl: string;
    expiresAt: string;
    invitedBy?: string | null;
  }): Promise<void>;
};

export type InvitationTokenIssuerPort = {
  issueToken(userId: string): Promise<{ token: string; expiresAt: string }>;
};

export class UserAccessService {
  constructor(
    private readonly userRepository: Pick<
      UserRepository,
      | 'findById'
      | 'findByUsername'
      | 'findByEmail'
      | 'listUsers'
      | 'createUser'
      | 'updateRoleId'
      | 'updateStatus'
      | 'deleteById'
    >,
    private readonly roleRepository: Pick<RoleRepository, 'findById' | 'findBySlug'>,
    private readonly userAccessRepository: Pick<
      UserAccessRepository,
      'findByScope' | 'findByUserId' | 'findOne' | 'findById' | 'create' | 'update' | 'deleteById'
    >,
    private readonly passwordService: Pick<PasswordService, 'hashPassword'>,
    private readonly invitationNotifier: InvitationNotifierPort,
    private readonly invitationTokens: InvitationTokenIssuerPort,
  ) {}

  async listUsers(scope: RoleScope, scopeId?: string): Promise<UserAccessRow[]> {
    this.validateScope(scope, scopeId);
    if (scope === 'cluster') return this.listClusterUsers();
    const access = await this.userAccessRepository.findByScope(scope, scopeId);
    return access.map((entry) => this.toRow(entry));
  }

  async listAssignableUsers(): Promise<any[]> {
    const users = await this.userRepository.listUsers();
    return users.map((user) => user.toJson());
  }

  async createOrganizationUser(input: {
    organizationId: string;
    username: string;
    password: string;
    roleId: string;
    email?: string | null;
  }): Promise<UserAccessRow> {
    const organizationId = input.organizationId.trim();
    const username = input.username.trim();
    const password = input.password.trim();
    if (!organizationId) throw new Error('Organization is required');
    if (!username) throw new Error('Username is required');
    if (!password) throw new Error('Password is required');

    const role = await this.findRoleForScope(input.roleId, 'organization', organizationId);
    const clusterUserRole = await this.ensureClusterUserRole();

    await this.userRepository.createUser({
      id: crypto.randomUUID(),
      username,
      email: input.email?.trim() || null,
      passwordHash: this.passwordService.hashPassword(password),
      role: this.toRoleView(clusterUserRole),
    });

    const user = await this.userRepository.findByUsername(username);
    if (!user) throw new Error('Failed to create user');

    const access = await this.createAccess({
      userId: user.id,
      roleId: role.id,
      scope: 'organization',
      organizationId,
    });
    return this.toRow(access);
  }

  async inviteOrganizationUser(input: {
    organizationId: string;
    organizationName: string;
    email: string;
    inviteUrl: string;
    roleId?: string;
    invitedBy?: string | null;
  }): Promise<UserAccessRow> {
    const organizationId = input.organizationId.trim();
    const email = input.email.trim().toLowerCase();
    if (!organizationId) throw new Error('Organization is required');
    if (!email) throw new Error('Email is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email is not valid');

    const role = input.roleId?.trim()
      ? await this.findRoleForScope(input.roleId, 'organization', organizationId)
      : await this.findDefaultOrganizationRole(organizationId);

    const user =
      (await this.userRepository.findByEmail(email)) ?? (await this.createInvitedUser(email));

    // an already active account just gets access, there is nothing to activate
    const status: UserAccessStatus = user.status === 'active' ? 'active' : 'invited';

    const access = await this.createAccess({
      userId: user.id,
      roleId: role.id,
      scope: 'organization',
      organizationId,
      status,
    });

    if (status === 'invited') {
      const invitation = await this.invitationTokens.issueToken(user.id);

      await this.invitationNotifier.sendInvitation({
        email,
        username: user.username,
        organizationName: input.organizationName,
        roleName: role.name,
        inviteUrl: this.buildInviteUrl(input.inviteUrl, invitation.token),
        expiresAt: invitation.expiresAt,
        invitedBy: input.invitedBy ?? null,
      });
    }

    return this.toRow(access);
  }

  private async createInvitedUser(email: string) {
    const clusterUserRole = await this.ensureClusterUserRole();
    const username = await this.buildUsernameFromEmail(email);

    await this.userRepository.createUser({
      id: crypto.randomUUID(),
      username,
      email,
      // placeholder credential: the invited user must set a password before signing in
      passwordHash: this.passwordService.hashPassword(crypto.randomBytes(32).toString('hex')),
      role: this.toRoleView(clusterUserRole),
      status: 'invited',
    });

    const user = await this.userRepository.findByUsername(username);
    if (!user) throw new Error('Failed to create user');
    return user;
  }

  async createClusterUser(input: {
    username: string;
    password: string;
    roleId: string;
    email?: string | null;
  }): Promise<UserAccessRow> {
    const username = input.username.trim();
    const password = input.password.trim();
    if (!username) throw new Error('Username is required');
    if (!password) throw new Error('Password is required');

    const role = await this.findRoleForScope(input.roleId, 'cluster', '');

    await this.userRepository.createUser({
      id: crypto.randomUUID(),
      username,
      email: input.email?.trim() || null,
      passwordHash: this.passwordService.hashPassword(password),
      role: this.toRoleView(role),
    });

    const user = await this.userRepository.findByUsername(username);
    if (!user) throw new Error('Failed to create user');
    return this.toClusterRow(user);
  }

  async assignProjectUser(input: {
    projectId: string;
    userId: string;
    roleId: string;
  }): Promise<UserAccessRow> {
    const projectId = input.projectId.trim();
    const userId = input.userId.trim();
    if (!projectId) throw new Error('Project is required');
    if (!userId) throw new Error('User is required');

    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error('User not found');
    const role = await this.findRoleForScope(input.roleId, 'project', projectId);

    const access = await this.createAccess({
      userId,
      roleId: role.id,
      scope: 'project',
      projectId,
    });
    return this.toRow(access);
  }

  async updateAccess(input: {
    accessId: string;
    scope: RoleScope;
    scopeId?: string;
    roleId: string;
    status: string;
  }): Promise<UserAccessRow> {
    const access = await this.findAccessInScope(input.accessId, input.scope, input.scopeId);
    if (input.scope === 'cluster') {
      const role = await this.findRoleForScope(input.roleId, 'cluster', '');
      const status = this.sanitizeStatus(input.status);
      await Promise.all([
        this.userRepository.updateRoleId(access.id, role.id),
        this.userRepository.updateStatus(access.id, status),
      ]);
      const updated = await this.userRepository.findById(access.id);
      if (!updated) throw new Error('Failed to update user access');
      return this.toClusterRow(updated);
    }

    const role = await this.findRoleForScope(input.roleId, access.scope, this.scopeIdFor(access));
    const status = this.sanitizeStatus(input.status);

    await this.userAccessRepository.update(access.id, { roleId: role.id, status });

    const updated = await this.userAccessRepository.findById(access.id);
    if (!updated) throw new Error('Failed to update user access');
    return this.toRow(updated);
  }

  async removeAccess(input: {
    accessId: string;
    scope: RoleScope;
    scopeId?: string;
  }): Promise<void> {
    const access = await this.findAccessInScope(input.accessId, input.scope, input.scopeId);
    if (input.scope === 'cluster' || input.scope === 'organization') {
      const userId = input.scope === 'cluster' ? access.id : access.userId;
      const userAccess = await this.userAccessRepository.findByUserId(access.userId);
      await Promise.all(userAccess.map((entry) => this.userAccessRepository.deleteById(entry.id)));
      await this.userRepository.deleteById(userId);
      return;
    }

    await this.userAccessRepository.deleteById(access.id);
  }

  async resendInvitation(input: {
    accessId: string;
    scope: RoleScope;
    scopeId?: string;
    organizationName?: string;
    inviteUrl?: string;
    invitedBy?: string | null;
  }): Promise<UserAccessRow> {
    const access = await this.findAccessInScope(input.accessId, input.scope, input.scopeId);
    if (input.scope === 'cluster') {
      const user = await this.userRepository.findById(access.id);
      if (!user) throw new Error('User not found');
      if (user.status !== 'invited') throw new Error('Only invited users can receive invitations');
      await this.userRepository.updateStatus(user.id, 'invited');
      const updated = await this.userRepository.findById(user.id);
      if (!updated) throw new Error('Failed to resend invitation');
      return this.toClusterRow(updated);
    }

    if (access.status !== 'invited') throw new Error('Only invited users can receive invitations');

    await this.userAccessRepository.update(access.id, { status: 'invited' });
    const updated = await this.userAccessRepository.findById(access.id);
    if (!updated) throw new Error('Failed to resend invitation');

    if (input.inviteUrl && updated.user?.email) {
      const invitation = await this.invitationTokens.issueToken(updated.userId);
      await this.invitationNotifier.sendInvitation({
        email: updated.user.email,
        username: updated.user.username,
        organizationName: input.organizationName ?? updated.organization?.name ?? '',
        roleName: updated.role?.name ?? '',
        inviteUrl: this.buildInviteUrl(input.inviteUrl, invitation.token),
        expiresAt: invitation.expiresAt,
        invitedBy: input.invitedBy ?? null,
      });
    }

    return this.toRow(updated);
  }

  private async createAccess(input: {
    userId: string;
    roleId: string;
    scope: RoleScope;
    organizationId?: string;
    projectId?: string;
    status?: UserAccessStatus;
  }): Promise<UserAccessDomain> {
    const { status, ...lookup } = input;
    const existing = await this.userAccessRepository.findOne(lookup);
    if (existing) throw new Error('User already has access in this scope');

    await this.userAccessRepository.create({
      id: crypto.randomUUID(),
      userId: input.userId,
      roleId: input.roleId,
      scope: input.scope,
      organizationId: input.organizationId,
      projectId: input.projectId,
      status: status ?? 'active',
    });

    const created = await this.userAccessRepository.findOne(lookup);
    if (!created) throw new Error('Failed to create user access');
    return created;
  }

  private buildInviteUrl(baseUrl: string, token: string): string {
    const url = new URL(baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private async findDefaultOrganizationRole(organizationId: string) {
    const role = await this.roleRepository.findBySlug(
      'org-developer',
      'organization',
      organizationId,
    );
    if (!role) throw new Error('Default organization role not found');
    return role;
  }

  /** Derives a unique username from the email local part. */
  private async buildUsernameFromEmail(email: string): Promise<string> {
    const base =
      email
        .split('@')[0]
        .replace(/[^a-zA-Z0-9._-]/g, '')
        .toLowerCase() || 'user';

    let candidate = base;
    for (let suffix = 1; await this.userRepository.findByUsername(candidate); suffix += 1) {
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  private async findRoleForScope(roleId: string, scope: RoleScope, scopeId: string) {
    const role = await this.roleRepository.findById(roleId.trim());
    if (!role) throw new Error('Role not found');
    if (role.scope !== scope) throw new Error(`Role must be a ${scope} role`);
    if (scope === 'organization' && role.organizationId !== scopeId) {
      throw new Error('Role does not belong to this organization');
    }
    if (scope === 'project' && role.projectId !== scopeId) {
      throw new Error('Role does not belong to this project');
    }
    return role;
  }

  private async findAccessInScope(
    accessId: string,
    scope: RoleScope,
    scopeId?: string,
  ): Promise<UserAccessDomain> {
    const access = await this.userAccessRepository.findById(accessId.trim());
    if (scope === 'cluster') {
      const user = await this.userRepository.findById(accessId.trim());
      if (!user) throw new Error('User not found');
      return this.clusterAccessAdapter(user);
    }

    if (!access) throw new Error('User access not found');
    if (access.scope !== scope) throw new Error('User access does not belong to this scope');
    if (scope === 'organization' && access.organizationId !== scopeId) {
      throw new Error('User access does not belong to this organization');
    }
    if (scope === 'project' && access.projectId !== scopeId) {
      throw new Error('User access does not belong to this project');
    }
    return access;
  }

  private scopeIdFor(access: UserAccessDomain): string {
    if (access.scope === 'organization') return access.organizationId ?? '';
    if (access.scope === 'project') return access.projectId ?? '';
    return '';
  }

  private sanitizeStatus(status: string): UserAccessStatus {
    return status === 'invited' ? 'invited' : 'active';
  }

  private async ensureClusterUserRole() {
    const existing = await this.roleRepository.findBySlug('cluster-user', 'cluster');
    if (existing) return existing;

    throw new Error('Cluster user role is required before creating organization users');
  }

  private validateScope(scope: RoleScope, scopeId?: string): void {
    if (scope !== 'cluster' && !scopeId?.trim()) {
      throw new Error(`${scope} ID is required`);
    }
  }

  private toRow(entry: UserAccessDomain): UserAccessRow {
    return {
      id: entry.id,
      userId: entry.userId,
      username: entry.user?.username ?? 'Unknown user',
      email: entry.user?.email ?? null,
      role: entry.role ? entry.role.toJson() : null,
      organizations: [],
      scope: entry.scope,
      organizationId: entry.organizationId,
      projectId: entry.projectId,
      status: entry.status,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  private toRoleView(role: NonNullable<UserAccessDomain['role']>): RoleView {
    const value = role.toJson();
    return {
      ...value,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }

  private async listClusterUsers(): Promise<UserAccessRow[]> {
    const [users, organizationAccess] = await Promise.all([
      this.userRepository.listUsers(),
      this.userAccessRepository.findByScope('organization'),
    ]);
    return users.map((user) => this.toClusterRow(user, organizationAccess));
  }

  private toClusterRow(user: UserDomain, access: UserAccessDomain[] = []): UserAccessRow {
    return {
      id: user.id,
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role ? user.role.toJson() : null,
      organizations: access
        .filter((entry) => entry.userId === user.id && entry.organization)
        .map((entry) => ({
          id: entry.organization?.id ?? '',
          name: entry.organization?.name ?? 'Unknown organization',
          slug: entry.organization?.slug ?? '',
          role: entry.role?.name ?? null,
        })),
      scope: 'cluster',
      organizationId: null,
      projectId: null,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private clusterAccessAdapter(user: UserDomain): UserAccessDomain {
    return {
      id: user.id,
      userId: user.id,
      roleId: user.role?.id ?? '',
      scope: 'cluster',
      organizationId: null,
      projectId: null,
      status: user.status,
      user,
      role: user.role,
      organization: null,
      project: null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      toJson: () => ({
        id: user.id,
        userId: user.id,
        roleId: user.role?.id ?? '',
        scope: 'cluster',
        organizationId: null,
        projectId: null,
        status: user.status,
        user: user.toJson(),
        role: user.role ? user.role.toJson() : null,
        organizations: [],
        organization: null,
        project: null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }),
    } as UserAccessDomain;
  }
}
