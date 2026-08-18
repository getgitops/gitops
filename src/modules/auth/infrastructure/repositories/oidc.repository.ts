import type { OidcProvider, OidcProviderType } from '../../domain/oidc';
import { OidcProviderDomain } from '../../domain/oidc.domain';
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
  async findAll(): Promise<OidcProviderDomain[]> {
    const result = await this.db.select().from(OidcProviderEntity).execute();
    return (result.rows as OidcRow[]).map((r) => this.toDomain(r));
  }

  async create(provider: OidcProvider): Promise<OidcProviderDomain> {
    const row = this.toJSON(provider);
    await this.db.insert(OidcProviderEntity).values(row).execute();
    return this.toDomain(row);
  }

  async update(provider: OidcProvider): Promise<OidcProviderDomain> {
    const row = this.toJSON(provider);
    await this.db.update(OidcProviderEntity).set(row).where({ id: provider.id }).execute();
    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(OidcProviderEntity).where({ id }).execute();
  }

  protected toDomain(row: OidcRow): OidcProviderDomain {
    if (row.type === 'github') {
      return new OidcProviderDomain({
        id: row.id,
        type: 'github',
        enabled: row.enabled,
        audience: row.audience,
        allowed_repos: row.allowed_repos ?? [],
      });
    }
    if (row.type === 'bitbucket') {
      return new OidcProviderDomain({
        id: row.id,
        type: 'bitbucket',
        enabled: row.enabled,
        audience: row.audience,
        allowed_workspace_uuids: row.allowed_workspace_uuids ?? [],
        allowed_repository_uuids: row.allowed_repository_uuids ?? [],
      });
    }
    if (row.type === 'custom') {
      return new OidcProviderDomain({
        id: row.id,
        type: 'custom',
        enabled: row.enabled,
        audience: row.audience,
        issuer: row.issuer ?? '',
        jwks_uri: row.jwks_uri ?? '',
        required_claims: row.required_claims ?? {},
      });
    }
    throw new Error(`Unknown OIDC provider type: '${row.type}'`);
  }

  protected toJSON(provider: OidcProvider): OidcRow {
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
