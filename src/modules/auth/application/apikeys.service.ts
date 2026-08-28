import crypto from 'crypto';
import type { ApiKeyView, AuthenticatedApiKey, SessionRole } from '../domain/entities';
import type { RoleDomain } from '../domain/role.domain';
import { ApiKeyRepository } from '../infrastructure/repositories/apikey.repository';

const TOKEN_PREFIX = 'gvs_';
const PREFIX_LENGTH = 10;

function hashApiKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): { token: string; keyPrefix: string; keyHash: string } {
  const token = `${TOKEN_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
  return { token, keyPrefix: token.slice(0, PREFIX_LENGTH), keyHash: hashApiKey(token) };
}

type RoleLookup = {
  findById(id: string): Promise<RoleDomain | null>;
};

type ProjectLookup = {
  getProject(id: string): Promise<{ id: string; organization?: { id: string } | null } | null>;
};

export class ApiKeysService {
  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly roleRepository?: RoleLookup,
    private readonly projectLookup?: ProjectLookup,
  ) {}

  async listActiveApiKeys(userId: string): Promise<ApiKeyView[]> {
    return this.apiKeyRepository.listByUser(userId);
  }

  async listActiveApiKeysByProject(projectId: string): Promise<ApiKeyView[]> {
    return this.apiKeyRepository.listByProject(projectId);
  }

  async validateApiKey(token: string): Promise<boolean> {
    return (await this.resolveApiKey(token)) !== null;
  }

  /** Looks up a key by its clear-text token and records the usage. Revoked, rotated and expired keys resolve to `null`. */
  async resolveApiKey(token: string): Promise<ApiKeyView | null> {
    const normalized = token.trim();
    if (!normalized.startsWith(TOKEN_PREFIX)) {
      return null;
    }

    const key = await this.apiKeyRepository.findValidByHash(hashApiKey(normalized));
    if (key) {
      await this.apiKeyRepository.touchLastUsed(key.id);
    }
    return key;
  }

  /** Resolves the machine identity (project + role) behind a bearer token, for the API key auth path. */
  async authenticate(token: string): Promise<AuthenticatedApiKey | null> {
    const key = await this.resolveApiKey(token);
    if (!key) {
      return null;
    }

    const role = key.roleId ? await this.roleRepository?.findById(key.roleId) : null;

    // a project key whose role is gone or was moved has no permissions left, so it must not authenticate
    if (key.projectId && (!role || role.scope !== 'project' || role.projectId !== key.projectId)) {
      return null;
    }

    let organizationId: string | null = role?.project?.organization?.id ?? null;
    if (key.projectId && !organizationId && this.projectLookup) {
      const project = await this.projectLookup.getProject(key.projectId).catch(() => null);
      organizationId = project?.organization?.id ?? null;
    }

    return {
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      projectId: key.projectId,
      organizationId,
      userId: key.userId,
      role: role ? (role.toJson() as SessionRole) : null,
    };
  }

  async createApiKey(
    userId: string,
    name: string,
    expiresAt: string | null,
  ): Promise<{ token: string; key: ApiKeyView }> {
    return this.persist({
      userId,
      projectId: null,
      roleId: null,
      createdByUserId: userId,
      name,
      expiresAt,
    });
  }

  /** Creates a project-scoped server key. `roleId` must be a role belonging to `projectId`. */
  async createProjectApiKey(input: {
    projectId: string;
    roleId: string;
    name: string;
    expiresAt: string | null;
    createdByUserId: string;
  }): Promise<{ token: string; key: ApiKeyView }> {
    await this.assertRoleBelongsToProject(input.roleId, input.projectId);

    return this.persist({
      userId: null,
      projectId: input.projectId,
      roleId: input.roleId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      expiresAt: input.expiresAt,
    });
  }

  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    const existing = await this.apiKeyRepository.findById(userId, keyId);

    if (!existing || existing.projectId) {
      throw new Error('API key not found');
    }

    if (existing.revokedAt) {
      throw new Error('API key is already revoked');
    }

    await this.apiKeyRepository.revoke(userId, keyId);
  }

  async revokeProjectApiKey(projectId: string, keyId: string): Promise<void> {
    const existing = await this.findProjectKey(projectId, keyId);

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

    if (!existing || existing.projectId) {
      throw new Error('API key not found');
    }

    if (existing.revokedAt) {
      throw new Error('API key is revoked');
    }

    return this.rotate(existing);
  }

  async regenerateProjectApiKey(
    projectId: string,
    keyId: string,
  ): Promise<{ token: string; key: ApiKeyView }> {
    const existing = await this.findProjectKey(projectId, keyId);

    if (existing.revokedAt) {
      throw new Error('API key is revoked');
    }

    return this.rotate(existing);
  }

  private async findProjectKey(projectId: string, keyId: string): Promise<ApiKeyView> {
    const existing = await this.apiKeyRepository.findByIdAny(keyId);

    if (!existing || existing.projectId !== projectId) {
      throw new Error('API key not found');
    }

    return existing;
  }

  private async assertRoleBelongsToProject(roleId: string, projectId: string): Promise<void> {
    if (!roleId.trim()) {
      throw new Error('A project role is required');
    }

    const role = await this.roleRepository?.findById(roleId);
    if (!role || role.scope !== 'project' || role.projectId !== projectId) {
      throw new Error('The selected role does not belong to this project');
    }
  }

  private async persist(input: {
    userId: string | null;
    projectId: string | null;
    roleId: string | null;
    createdByUserId: string | null;
    name: string;
    expiresAt: string | null;
  }): Promise<{ token: string; key: ApiKeyView }> {
    const name = input.name.trim();
    if (!name) {
      throw new Error('Key name is required');
    }

    if (Boolean(input.userId) === Boolean(input.projectId)) {
      throw new Error('An API key must belong to either a user or a project');
    }

    const id = crypto.randomUUID();
    const { token, keyPrefix, keyHash } = generateToken();

    await this.apiKeyRepository.create({
      id,
      userId: input.userId,
      projectId: input.projectId,
      roleId: input.roleId,
      createdByUserId: input.createdByUserId,
      name,
      keyPrefix,
      keyHash,
      expiresAt: input.expiresAt,
    });

    return {
      token,
      key: {
        id,
        name,
        keyPrefix,
        userId: input.userId,
        projectId: input.projectId,
        roleId: input.roleId,
        createdByUserId: input.createdByUserId,
        expiresAt: input.expiresAt,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date().toISOString(),
      },
    };
  }

  private async rotate(existing: ApiKeyView): Promise<{ token: string; key: ApiKeyView }> {
    const { token, keyPrefix, keyHash } = generateToken();

    await this.apiKeyRepository.updateKeyMaterial(existing.id, {
      keyPrefix,
      keyHash,
      expiresAt: existing.expiresAt,
    });

    return {
      token,
      key: { ...existing, keyPrefix, lastUsedAt: null, revokedAt: null },
    };
  }
}
