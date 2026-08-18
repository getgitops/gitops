export type OidcProviderType = 'github' | 'bitbucket' | 'custom';

export type OidcProviderBase = {
  id: string;
  type: OidcProviderType;
  enabled: boolean;
  audience: string;
};

export type GithubOidcProvider = OidcProviderBase & {
  type: 'github';
  allowed_repos: string[];
};

export type BitbucketOidcProvider = OidcProviderBase & {
  type: 'bitbucket';
  allowed_workspace_uuids: string[];
  allowed_repository_uuids: string[];
};

export type CustomOidcProvider = OidcProviderBase & {
  type: 'custom';
  issuer: string;
  jwks_uri: string;
  required_claims: Record<string, string>;
};

export type OidcProvider = GithubOidcProvider | BitbucketOidcProvider | CustomOidcProvider;

export type OidcConfig = {
  providers: OidcProvider[];
};
