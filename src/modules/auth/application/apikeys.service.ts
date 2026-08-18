
import crypto from 'crypto';
import type { ApiKeyView } from '../domain/entities';
import { ApiKeyRepository } from '../infrastructure/repositories/apikey.repository';

function hashApiKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}


export class ApiKeysService {
  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
  ) {}

  async listActiveApiKeys(userId: string): Promise<ApiKeyView[]> {
    return this.apiKeyRepository.listByUser(userId);
  }

  async createApiKey(userId: string, name: string, expiresAt: string | null): Promise<{ token: string; key: ApiKeyView }> {
    const token = `gvs_${crypto.randomBytes(24).toString('hex')}`;
    const id = crypto.randomUUID();
    const keyPrefix = token.slice(0, 6);

    await this.apiKeyRepository.create({
      id,
      userId,
      name,
      keyPrefix,
      keyHash: hashApiKey(token),
      expiresAt,
    });

    return {
      token,
      key: {
        id,
        name,
        keyPrefix,
        expiresAt,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
      },
    };
  }

  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    const existing = await this.apiKeyRepository.findById(userId, keyId);

    if (!existing) {
      throw new Error('API key not found');
    }

    if (existing.revokedAt) {
      throw new Error('API key is already revoked');
    }

    await this.apiKeyRepository.revoke(userId, keyId);
  }

  async regenerateApiKey(userId: string, keyId: string): Promise<{ token: string; key: ApiKeyView }> {
    const existing = await this.apiKeyRepository.findById(userId, keyId);

    if (!existing) {
      throw new Error('API key not found');
    }

    if (existing.revokedAt) {
      throw new Error('API key is revoked');
    }

    const token = `gvs_${crypto.randomBytes(24).toString('hex')}`;
    const keyPrefix = token.slice(0, 6);

    await this.apiKeyRepository.updateKeyMaterial(userId, keyId, {
      keyPrefix,
      keyHash: hashApiKey(token),
      expiresAt: existing.expiresAt,
    });

    return {
      token,
      key: {
        id: keyId,
        name: existing.name,
        keyPrefix,
        expiresAt: existing.expiresAt,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
      },
    };
  }

}