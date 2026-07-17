import crypto from 'crypto';
import type { ApiKeyView, AuthenticatedUser } from '../domain/entities';
import { UserRepository } from '../infrastructure/repositories/user.repository';
import { PasswordService } from './password.service';

function hashApiKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class ProfileService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async getAuthenticatedUserProfile(userId: string): Promise<any | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return null;
    }

    return user.toJson();
  }

  async updateEmail(userId: string, email: string | null): Promise<void> {
    await this.userRepository.updateEmail(userId, email);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return false;
    }

    if (!this.passwordService.verifyPassword(currentPassword, user.passwordHash)) {
      return false;
    }

    await this.userRepository.updatePassword(userId, this.passwordService.hashPassword(newPassword));
    return true;
  }

  async listActiveApiKeys(userId: string): Promise<ApiKeyView[]> {
    const keys = await this.userRepository.listActiveApiKeys(userId);
    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    }));
  }

  async createApiKey(userId: string, name: string): Promise<{ token: string; key: ApiKeyView }> {
    const token = `gvs_${crypto.randomBytes(24).toString('hex')}`;
    const id = crypto.randomUUID();

    await this.userRepository.createApiKey({
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

  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    await this.userRepository.revokeApiKey(userId, keyId);
  }
}
