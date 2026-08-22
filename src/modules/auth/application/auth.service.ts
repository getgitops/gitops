import crypto from 'crypto';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { UserRepository } from '../infrastructure/repositories/user.repository';
import { RoleRepository } from '../infrastructure/repositories/role.repository';

const CLUSTER_ADMIN_PERMISSIONS = ['vault:all', 'openreport:all', 'stateiac:all'];
const CLUSTER_USER_PERMISSIONS: string[] = [];

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async bootstrapDefaults(): Promise<void> {
    this.passwordService.ensureEncryptionKey();

    const clusterAdminRole = await this.ensureClusterAdminRole();
    await this.ensureClusterUserRole();

    const adminExists = await this.userRepository.findByUsername('admin');
    if (!adminExists) {
      // const roleAdmin = await this.roleRepository
      // console.error('No admin user found. Please create an admin user to access the system.');
      // await this.userRepository.createUser({
      //   id: crypto.randomUUID(),
      //   username: 'admin',
      //   email: null,
      //   passwordHash: this.passwordService.hashPassword('admin'),
      //   role: '00000000-0000-0000-0000-000000000001',
      // });
      // console.log('Default admin user created (admin:admin)');
      return;
    }

    if (adminExists.role?.id !== clusterAdminRole.id) {
      await this.userRepository.updateRoleId(adminExists.id, clusterAdminRole.id);
    }
  }

  private async ensureClusterAdminRole(): Promise<any> {
    const existing = await this.roleRepository.findBySlug('cluster-admin', 'cluster');

    if (existing) {
      await this.roleRepository.update(existing.id, {
        name: 'Cluster Admin',
        permissions: CLUSTER_ADMIN_PERMISSIONS,
      });
      const updated = await this.roleRepository.findById(existing.id);
      if (!updated) throw new Error('Failed to load cluster-admin role');
      return updated;
    }

    await this.roleRepository.create({
      id: crypto.randomUUID(),
      slug: 'cluster-admin',
      name: 'Cluster Admin',
      scope: 'cluster',
      permissions: CLUSTER_ADMIN_PERMISSIONS,
    });

    const created = await this.roleRepository.findBySlug('cluster-admin', 'cluster');
    if (!created) throw new Error('Failed to create cluster-admin role');
    return created;
  }

  private async ensureClusterUserRole(): Promise<any> {
    const existing = await this.roleRepository.findBySlug('cluster-user', 'cluster');

    if (existing) {
      await this.roleRepository.update(existing.id, {
        name: 'Cluster User',
        permissions: CLUSTER_USER_PERMISSIONS,
      });
      const updated = await this.roleRepository.findById(existing.id);
      if (!updated) throw new Error('Failed to load cluster-user role');
      return updated;
    }

    await this.roleRepository.create({
      id: crypto.randomUUID(),
      slug: 'cluster-user',
      name: 'Cluster User',
      scope: 'cluster',
      permissions: CLUSTER_USER_PERMISSIONS,
    });

    const created = await this.roleRepository.findBySlug('cluster-user', 'cluster');
    if (!created) throw new Error('Failed to create cluster-user role');
    return created;
  }

  async authenticate(username: string, password: string): Promise<any> {
    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      return null;
    }

    if (!this.passwordService.verifyPassword(password, user.password)) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }

  createSessionToken(userId: string): string {
    return this.sessionService.createToken(userId);
  }

  async resolveAuthenticatedUser(sessionToken: string | undefined): Promise<any> {
    const userId = this.sessionService.parseAndVerifyToken(sessionToken);
    if (!userId) {
      return null;
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
        ? {
            id: user.role.id,
            name: user.role.name,
            slug: user.role.slug,
            scope: user.role.scope,
            organizationId: user.role.organizationId,
            projectId: user.role.projectId,
            permissions: Array.isArray(user.role.permissions) ? user.role.permissions : [],
          }
        : null,
    };
  }
}
