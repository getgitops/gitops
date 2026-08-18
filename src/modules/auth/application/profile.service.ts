import type { ApiKeyView } from '../domain/entities';
import { UserRepository } from '../infrastructure/repositories/user.repository';
import { PasswordService } from './password.service';
import { ApiKeysService } from './apikeys.service';

export class ProfileService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordService: PasswordService,
    private readonly apiKeysService: ApiKeysService,
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
    return this.apiKeysService.listActiveApiKeys(userId);
  }

  async createApiKey(userId: string, name: string, expiresAt: string | null): Promise<{ token: string; key: ApiKeyView }> {
    return this.apiKeysService.createApiKey(userId, name, expiresAt);
  }

  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    await this.apiKeysService.revokeApiKey(userId, keyId);
  }

  async regenerateApiKey(userId: string, keyId: string): Promise<{ token: string; key: ApiKeyView }> {
    return this.apiKeysService.regenerateApiKey(userId, keyId);
  }
}
