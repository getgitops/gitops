import crypto from 'crypto';
import type { RoleScope } from '../domain/role.domain';
import type { RoleView } from '../domain/entities';
import type { UserAccessDomain } from '../domain/user-access.domain';
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
  scope: RoleScope;
  organizationId: string | null;
  projectId: string | null;
  createdAt: string;
};

export class UserAccessService {
  constructor(
    private readonly userRepository: Pick<
      UserRepository,
      'findById' | 'findByUsername' | 'listUsers' | 'createUser'
    >,
    private readonly roleRepository: Pick<RoleRepository, 'findById' | 'findBySlug'>,
    private readonly userAccessRepository: Pick<
      UserAccessRepository,
      'findByScope' | 'findOne' | 'create'
    >,
    private readonly passwordService: Pick<PasswordService, 'hashPassword'>,
  ) {}

  async listUsers(scope: RoleScope, scopeId?: string): Promise<UserAccessRow[]> {
    this.validateScope(scope, scopeId);
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

  private async createAccess(input: {
    userId: string;
    roleId: string;
    scope: RoleScope;
    organizationId?: string;
    projectId?: string;
  }): Promise<UserAccessDomain> {
    const existing = await this.userAccessRepository.findOne(input);
    if (existing) throw new Error('User already has access in this scope');

    await this.userAccessRepository.create({
      id: crypto.randomUUID(),
      userId: input.userId,
      roleId: input.roleId,
      scope: input.scope,
      organizationId: input.organizationId,
      projectId: input.projectId,
    });

    const created = await this.userAccessRepository.findOne(input);
    if (!created) throw new Error('Failed to create user access');
    return created;
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
      scope: entry.scope,
      organizationId: entry.organizationId,
      projectId: entry.projectId,
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
}
