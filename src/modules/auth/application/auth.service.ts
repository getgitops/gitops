import crypto from 'crypto';
import type { AuthenticatedUser } from '../domain/entities';
import type { AuthUserRepository } from '../domain/repositories';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

export class AuthService {
  constructor(
    private readonly userRepository: AuthUserRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  bootstrapDefaults(): void {
    this.passwordService.ensureEncryptionKey();

    const adminExists = this.userRepository.findByUsername('admin');
    if (!adminExists) {
      this.userRepository.createUser({
        id: crypto.randomUUID(),
        username: 'admin',
        email: null,
        passwordHash: this.passwordService.hashPassword('admin'),
        role: 'admin',
      });
      console.log('Default admin user created (admin:admin)');
    }
  }

  authenticate(username: string, password: string): AuthenticatedUser | null {
    const user = this.userRepository.findByUsername(username);
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

  resolveAuthenticatedUser(sessionToken: string | undefined): AuthenticatedUser | null {
    const userId = this.sessionService.parseAndVerifyToken(sessionToken);
    if (!userId) {
      return null;
    }

    const user = this.userRepository.findById(userId);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }
}
