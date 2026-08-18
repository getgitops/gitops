import crypto from 'crypto';

import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { UserRepository } from '../infrastructure/repositories/user.repository';

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async bootstrapDefaults(): Promise<void> {
    this.passwordService.ensureEncryptionKey();

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
    }
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
      role: user.role ? {
        id: user.role.id,
        name: user.role.name,
        slug: user.role.slug,
        permissions: Array.isArray(user.role.permissions) ? user.role.permissions : [],
      } : null,
    };
  }
}
