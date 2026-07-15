import crypto from 'crypto';
import type { ApiKeyView, AuthenticatedUser } from '../domain/entities';
import type { AuthUserRepository } from '../domain/repositories';
import { PasswordService } from './password.service';

function hashApiKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class ProfileService {
  constructor(
    private readonly userRepository: AuthUserRepository,
    private readonly passwordService: PasswordService,
  ) {}

  getAuthenticatedUserProfile(userId: string): AuthenticatedUser | null {
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

  updateEmail(userId: string, email: string | null): void {
    this.userRepository.updateEmail(userId, email);
  }

  changePassword(userId: string, currentPassword: string, newPassword: string): boolean {
    const user = this.userRepository.findById(userId);
    if (!user) {
      return false;
    }

    if (!this.passwordService.verifyPassword(currentPassword, user.passwordHash)) {
      return false;
    }

    this.userRepository.updatePassword(userId, this.passwordService.hashPassword(newPassword));
    return true;
  }

  listActiveApiKeys(userId: string): ApiKeyView[] {
    return this.userRepository.listActiveApiKeys(userId).map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    }));
  }

  createApiKey(userId: string, name: string): { token: string; key: ApiKeyView } {
    const token = `gvs_${crypto.randomBytes(24).toString('hex')}`;
    const id = crypto.randomUUID();

    this.userRepository.createApiKey({
      id,
      userId,
      name,
      keyPrefix: token.slice(0, 10),
      keyHash: hashApiKey(token),
    });

    return {
      token,
      key: {
        id,
        name,
        keyPrefix: token.slice(0, 10),
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
      },
    };
  }

  revokeApiKey(userId: string, keyId: string): void {
    this.userRepository.revokeApiKey(userId, keyId);
  }
}
