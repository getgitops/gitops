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
      // await this.userRepository.createUser({
      //   id: crypto.randomUUID(),
      //   username: 'admin',
      //   email: null,
      //   passwordHash: this.passwordService.hashPassword('admin'),
      //   role: 'admin',
      // });
      // console.log('Default admin user created (admin:admin)');
    }
  }

  async authenticate(username: string, password: string): Promise<any> {
    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      return null;
    }

    if (!this.passwordService.verifyPassword(password, user.passwordHash)) {
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
      } : null,
    };
  }
}
