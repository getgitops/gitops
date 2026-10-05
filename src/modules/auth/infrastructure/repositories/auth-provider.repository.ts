import crypto from 'crypto';
import { OrganizationAuthProviderEntity } from '$lib/database/schemas';
import { AuthProviderDomain, type AuthProviderType } from '../../domain/auth-provider.domain';
import { Repository } from './repository';

export type AuthProviderChanges = {
  enabled?: boolean;
  clientId?: string | null;
  clientSecretEncrypted?: string | null;
  allowedDomains?: string[];
};

export class AuthProviderRepository extends Repository {
  async findByOrganization(
    organizationId: string,
    provider: AuthProviderType,
  ): Promise<AuthProviderDomain | null> {
    const result = await this.db
      .select()
      .from(OrganizationAuthProviderEntity)
      .where({ organizationId, provider })
      .limit(1);
    const row = result.rows[0];
    return row ? new AuthProviderDomain(row) : null;
  }

  async findEnabled(provider: AuthProviderType): Promise<AuthProviderDomain[]> {
    const result = await this.db
      .select()
      .from(OrganizationAuthProviderEntity)
      .where({ provider, enabled: true });
    return result.rows.map((row: any) => new AuthProviderDomain(row));
  }

  async upsert(
    organizationId: string,
    provider: AuthProviderType,
    changes: AuthProviderChanges,
  ): Promise<AuthProviderDomain> {
    const existing = await this.findByOrganization(organizationId, provider);
    const now = new Date().toISOString();

    if (!existing) {
      await this.db.insert(OrganizationAuthProviderEntity).values({
        id: crypto.randomUUID(),
        organizationId,
        provider,
        enabled: changes.enabled ?? false,
        clientId: changes.clientId ?? null,
        clientSecretEncrypted: changes.clientSecretEncrypted ?? null,
        allowedDomains: changes.allowedDomains ?? [],
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await this.db
        .update(OrganizationAuthProviderEntity)
        .set({ ...changes, updatedAt: now })
        .where({ id: existing.id });
    }

    const updated = await this.findByOrganization(organizationId, provider);
    if (!updated) throw new Error('Failed to persist authentication provider');
    return updated;
  }
}
