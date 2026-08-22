import crypto from 'crypto';
import type { ApiKeyView } from '../domain/entities';
import { ApiKeyRepository } from '../infrastructure/repositories/apikey.repository';

function hashApiKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class ApiKeysService {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async listActiveApiKeys(userId: string): Promise<ApiKeyView[]> {
    return this.apiKeyRepository.listByUser(userId);
  }

  async listActiveApiKeysByProject(projectId: string): Promise<ApiKeyView[]> {
    return this.apiKeyRepository.listByProject(projectId);
  }

  async validateApiKey(token: string): Promise<boolean> {
    if (!token.trim()) {
      return false;
    }

    const key = await this.apiKeyRepository.findValidByHash(hashApiKey(token));
    return key !== null;
  }

  // returns the full key (with projectId) for machine-to-machine endpoints that need to know
  // which project issued the key, e.g. POST /api/code-report/analyse-result
  async resolveApiKey(token: string): Promise<ApiKeyView | null> {
    if (!token.trim()) {
      return null;
    }

    const key = await this.apiKeyRepository.findValidByHash(hashApiKey(token));
    if (key) {
      await this.apiKeyRepository.touchLastUsed(key.id);
    }
    return key;
  }

  async createApiKey(
    userId: string,
    name: string,
    expiresAt: string | null,
    projectId: string | null = null,
  ): Promise<{ token: string; key: ApiKeyView }> {
    const token = `gvs_${crypto.randomBytes(24).toString('hex')}`;
    const id = crypto.randomUUID();
    const keyPrefix = token.slice(0, 6);

    await this.apiKeyRepository.create({
      id,
      userId,
      projectId,
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
        projectId,
        expiresAt,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date().toISOString(),
      },
    };
  }

  // convenience wrapper for project-scoped server access keys (used by CI/CD integrations)
  async createProjectApiKey(
    userId: string,
    projectId: string,
    name: string,
    expiresAt: string | null,
  ): Promise<{ token: string; key: ApiKeyView }> {
    return this.createApiKey(userId, name, expiresAt, projectId);
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

  async revokeProjectApiKey(projectId: string, keyId: string): Promise<void> {
    const existing = await this.apiKeyRepository.findByIdAny(keyId);

    if (!existing || existing.projectId !== projectId) {
      throw new Error('API key not found');
    }

    if (existing.revokedAt) {
      throw new Error('API key is already revoked');
    }

    await this.apiKeyRepository.revokeAny(keyId);
  }

  async regenerateApiKey(
    userId: string,
    keyId: string,
  ): Promise<{ token: string; key: ApiKeyView }> {
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
        projectId: existing.projectId,
        expiresAt: existing.expiresAt,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date().toISOString(),
      },
    };
  }
}
