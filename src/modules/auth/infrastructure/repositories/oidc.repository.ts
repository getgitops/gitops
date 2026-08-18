import type { OidcProvider, OidcProviderType } from '../../domain/oidc';
import { OidcProviderEntity } from '$lib/database/schemas';
import { Repository } from './repository';

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
    const result = await this.db.select().from(OidcProviderEntity).execute();
    return (result.rows as OidcRow[]).map((r) => this.toDomain(r));
  }

  async save(provider: OidcProvider): Promise<void> {
    const row = this.toRow(provider);
    const existing = await this.db
      .select()
      .from(OidcProviderEntity)
      .where({ id: provider.id })
      .execute();

    if (existing.rows.length > 0) {
      await this.db.update(OidcProviderEntity).set(row).where({ id: provider.id }).execute();
    } else {
      await this.db.insert(OidcProviderEntity).values(row).execute();
    }
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(OidcProviderEntity).where({ id }).execute();
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
    if (row.type === 'custom') {
      return {
        ...base,
        type: 'custom',
        issuer: row.issuer ?? '',
        jwks_uri: row.jwks_uri ?? '',
        required_claims: row.required_claims ?? {},
      };
    }
    throw new Error(`Unknown OIDC provider type: '${row.type}'`);
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
