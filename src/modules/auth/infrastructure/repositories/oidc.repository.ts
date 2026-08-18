import { entity, text, boolean, json, uuid } from '@getgitops/gitdb';
import type { OidcProvider, OidcProviderType } from '../../domain/oidc';
import { Repository } from './repository';

export const oidcProviderEntity = entity('server_oidc', {
  id: uuid().primaryKey(),
  type: text().notNull(),
  enabled: boolean().notNull().default(true),
  audience: text().notNull(),
  // GitHub-specific
  allowed_repos: json(),
  // Bitbucket-specific
  allowed_workspace_uuids: json(),
  allowed_repository_uuids: json(),
  // Custom-specific
  issuer: text(),
  jwks_uri: text(),
  required_claims: json(),
});

type OidcRow = {
  id: string;
  type: OidcProviderType;
  enabled: boolean;
  audience: string;
  allowed_repos: string[] | null;
  allowed_workspace_uuids: string[] | null;
  allowed_repository_uuids: string[] | null;
  issuer: string | null;
  jwks_uri: string | null;
  required_claims: Record<string, string> | null;
};

export class OidcRepository extends Repository {
  async findAll(): Promise<OidcProvider[]> {
    const result = await this.db.select().from(oidcProviderEntity).execute();
    return (result.rows as OidcRow[]).map((r) => this.toDomain(r));
  }

  async save(provider: OidcProvider): Promise<void> {
    const row = this.toRow(provider);
    const existing = await this.db
      .select()
      .from(oidcProviderEntity)
      .where({ id: provider.id })
      .execute();

    if (existing.rows.length > 0) {
      await this.db.update(oidcProviderEntity).set(row).where({ id: provider.id }).execute();
    } else {
      await this.db.insert(oidcProviderEntity).values(row).execute();
    }
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(oidcProviderEntity).where({ id }).execute();
  }

  protected override toDomain(row: OidcRow): OidcProvider {
    const base = {
      id: row.id,
      enabled: row.enabled,
      audience: row.audience,
    };
    if (row.type === 'github') {
      return {
        ...base,
        type: 'github',
        allowed_repos: row.allowed_repos ?? [],
      };
    }
    if (row.type === 'bitbucket') {
      return {
        ...base,
        type: 'bitbucket',
        allowed_workspace_uuids: row.allowed_workspace_uuids ?? [],
        allowed_repository_uuids: row.allowed_repository_uuids ?? [],
      };
    }
    return {
      ...base,
      type: 'custom',
      issuer: row.issuer ?? '',
      jwks_uri: row.jwks_uri ?? '',
      required_claims: row.required_claims ?? {},
    };
  }

  private toRow(provider: OidcProvider): OidcRow {
    const base: OidcRow = {
      id: provider.id,
      type: provider.type,
      enabled: provider.enabled,
      audience: provider.audience,
      allowed_repos: null,
      allowed_workspace_uuids: null,
      allowed_repository_uuids: null,
      issuer: null,
      jwks_uri: null,
      required_claims: null,
    };
    if (provider.type === 'github') {
      return { ...base, allowed_repos: provider.allowed_repos };
    }
    if (provider.type === 'bitbucket') {
      return {
        ...base,
        allowed_workspace_uuids: provider.allowed_workspace_uuids,
        allowed_repository_uuids: provider.allowed_repository_uuids,
      };
    }
    return {
      ...base,
      issuer: provider.issuer,
      jwks_uri: provider.jwks_uri,
      required_claims: provider.required_claims,
    };
  }
}
