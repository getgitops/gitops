import { Domain } from './domain';
import type { OidcProvider } from './oidc';

export class OidcProviderDomain extends Domain {
  public type: 'github' | 'bitbucket' | 'custom' = 'github';
  public enabled: boolean = true;
  public audience: string = '';
  // GitHub-specific
  public allowed_repos: string[] = [];
  // Bitbucket-specific
  public allowed_workspace_uuids: string[] = [];
  public allowed_repository_uuids: string[] = [];
  // Custom-specific
  public issuer: string = '';
  public jwks_uri: string = '';
  public required_claims: Record<string, string> = {};

  constructor(data: OidcProvider) {
    super(data);
    this.type = data.type;
    this.enabled = data.enabled;
    this.audience = data.audience;
    if (data.type === 'github') {
      this.allowed_repos = data.allowed_repos ?? [];
    } else if (data.type === 'bitbucket') {
      this.allowed_workspace_uuids = data.allowed_workspace_uuids ?? [];
      this.allowed_repository_uuids = data.allowed_repository_uuids ?? [];
    } else {
      this.issuer = data.issuer ?? '';
      this.jwks_uri = data.jwks_uri ?? '';
      this.required_claims = data.required_claims ?? {};
    }
  }

  toJson(): OidcProvider {
    const base = {
      id: this.id,
      enabled: this.enabled,
      audience: this.audience,
    };
    if (this.type === 'github') {
      return { ...base, type: 'github' as const, allowed_repos: this.allowed_repos };
    }
    if (this.type === 'bitbucket') {
      return {
        ...base,
        type: 'bitbucket' as const,
        allowed_workspace_uuids: this.allowed_workspace_uuids,
        allowed_repository_uuids: this.allowed_repository_uuids,
      };
    }
    return {
      ...base,
      type: 'custom' as const,
      issuer: this.issuer,
      jwks_uri: this.jwks_uri,
      required_claims: this.required_claims,
    };
  }
}
