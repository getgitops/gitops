import type {
  OidcProvider,
  GithubOidcProvider,
  BitbucketOidcProvider,
  CustomOidcProvider,
} from '../domain/oidc';
import type { OidcService } from '../application/oidc.service';

const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
const BITBUCKET_ISSUER_PREFIX = 'https://api.bitbucket.org/';

type JwkKey = {
  kty: string;
  use?: string;
  kid?: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
  crv?: string;
  alg?: string;
};

type JwtHeader = {
  alg: string;
  kid?: string;
};

type JwtPayload = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  repository?: string;
  workspace_uuid?: string;
  repository_uuid?: string;
  [key: string]: unknown;
};

// Cache JWKS per URI to avoid repeated network calls.
const jwksCache = new Map<string, { keys: JwkKey[]; fetchedAt: number }>();
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchJwks(jwksUri: string): Promise<JwkKey[]> {
  const cached = jwksCache.get(jwksUri);
  if (cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keys;
  }
  const response = await fetch(jwksUri);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS from ${jwksUri}: ${response.status}`);
  }
  const data = (await response.json()) as { keys: JwkKey[] };
  const keys = data.keys ?? [];
  jwksCache.set(jwksUri, { keys, fetchedAt: Date.now() });
  return keys;
}

async function resolveJwksUri(issuer: string): Promise<string> {
  const discoveryUrl = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const response = await fetch(discoveryUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC discovery from ${discoveryUrl}: ${response.status}`);
  }
  const config = (await response.json()) as { jwks_uri: string };
  if (!config.jwks_uri) {
    throw new Error(`No jwks_uri in OIDC discovery document at ${discoveryUrl}`);
  }
  return config.jwks_uri;
}

function base64urlToBuffer(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

async function importRsaPublicKey(key: JwkKey, alg: string): Promise<CryptoKey> {
  const hash = alg === 'RS384' ? 'SHA-384' : alg === 'RS512' ? 'SHA-512' : 'SHA-256';
  return crypto.subtle.importKey(
    'jwk',
    key as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash },
    false,
    ['verify'],
  );
}

async function importEcPublicKey(key: JwkKey): Promise<CryptoKey> {
  const namedCurve = key.crv ?? 'P-256';
  return crypto.subtle.importKey(
    'jwk',
    key as JsonWebKey,
    { name: 'ECDSA', namedCurve },
    false,
    ['verify'],
  );
}

async function verifySignature(
  header: JwtHeader,
  signingInput: string,
  signatureB64: string,
  key: JwkKey,
): Promise<boolean> {
  const data = new TextEncoder().encode(signingInput);
  const signature = base64urlToBuffer(signatureB64);

  if (header.alg.startsWith('RS')) {
    const cryptoKey = await importRsaPublicKey(key, header.alg);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature as unknown as ArrayBuffer, data);
  }

  if (header.alg.startsWith('ES')) {
    const cryptoKey = await importEcPublicKey(key);
    const hashAlg = header.alg === 'ES256' ? 'SHA-256' : header.alg === 'ES384' ? 'SHA-384' : 'SHA-512';
    return crypto.subtle.verify({ name: 'ECDSA', hash: hashAlg }, cryptoKey, signature as unknown as ArrayBuffer, data);
  }

  throw new Error(`Unsupported algorithm: ${header.alg}`);
}

function parseJwt(token: string): { header: JwtHeader; payload: JwtPayload; signingInput: string; signatureB64: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as JwtHeader;
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as JwtPayload;

  return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signatureB64: parts[2] };
}

function audienceMatches(tokenAud: string | string[] | undefined, expectedAud: string): boolean {
  if (!tokenAud) return false;
  const audList = Array.isArray(tokenAud) ? tokenAud : [tokenAud];
  return audList.includes(expectedAud);
}

async function validateTokenSignature(
  header: JwtHeader,
  signingInput: string,
  signatureB64: string,
  jwksUri: string,
  kid?: string,
): Promise<void> {
  const keys = await fetchJwks(jwksUri);
  const candidates = kid ? keys.filter((k) => k.kid === kid) : keys;

  if (candidates.length === 0) {
    throw new Error('No matching JWK found for token');
  }

  for (const key of candidates) {
    try {
      const valid = await verifySignature(header, signingInput, signatureB64, key);
      if (valid) return;
    } catch {
      // try next key
    }
  }
  throw new Error('JWT signature verification failed');
}

async function validateGithubToken(payload: JwtPayload, provider: GithubOidcProvider): Promise<void> {
  if (!audienceMatches(payload.aud, provider.audience)) {
    throw new Error(`Invalid audience. Expected: ${provider.audience}`);
  }
  const repo = payload.repository as string | undefined;
  if (!repo || !provider.allowed_repos.includes(repo)) {
    throw new Error(`Repository '${repo}' is not in the allowed list`);
  }
}

async function validateBitbucketToken(payload: JwtPayload, provider: BitbucketOidcProvider): Promise<void> {
  if (!audienceMatches(payload.aud, provider.audience)) {
    throw new Error(`Invalid audience. Expected: ${provider.audience}`);
  }
  const wsUuid = payload.workspace_uuid as string | undefined;
  if (
    provider.allowed_workspace_uuids.length > 0 &&
    (!wsUuid || !provider.allowed_workspace_uuids.includes(wsUuid))
  ) {
    throw new Error(`Workspace UUID '${wsUuid}' is not in the allowed list`);
  }
  const repoUuid = payload.repository_uuid as string | undefined;
  if (
    provider.allowed_repository_uuids.length > 0 &&
    (!repoUuid || !provider.allowed_repository_uuids.includes(repoUuid))
  ) {
    throw new Error(`Repository UUID '${repoUuid}' is not in the allowed list`);
  }
}

async function validateCustomToken(payload: JwtPayload, provider: CustomOidcProvider): Promise<void> {
  if (!audienceMatches(payload.aud, provider.audience)) {
    throw new Error(`Invalid audience. Expected: ${provider.audience}`);
  }
  for (const [claim, expected] of Object.entries(provider.required_claims)) {
    const actual = payload[claim];
    if (actual !== expected) {
      throw new Error(`Required claim '${claim}' mismatch. Expected: ${expected}, got: ${actual}`);
    }
  }
}

export class OidcValidator {
  constructor(private readonly oidcService: OidcService) {}

  async validate(token: string): Promise<{ valid: true; payload: JwtPayload } | { valid: false; error: string }> {
    try {
      const { header, payload, signingInput, signatureB64 } = parseJwt(token);

      // Require and validate expiration
      if (!payload.exp) {
        return { valid: false, error: 'Missing exp claim' };
      }
      if (Date.now() / 1000 > payload.exp) {
        return { valid: false, error: 'Token has expired' };
      }

      const issuer = payload.iss;
      if (!issuer) return { valid: false, error: 'Missing iss claim' };

      const providers = await this.oidcService.list();
      const enabledProviders = providers.filter((p) => p.enabled);

      const matchingProviders = enabledProviders.filter((p) => {
        if (p.type === 'github') return issuer === GITHUB_ISSUER;
        if (p.type === 'bitbucket') return issuer.startsWith(BITBUCKET_ISSUER_PREFIX);
        if (p.type === 'custom') return issuer === p.issuer;
        return false;
      });

      if (matchingProviders.length === 0) {
        return { valid: false, error: `No enabled OIDC provider found for issuer: ${issuer}` };
      }

      for (const provider of matchingProviders) {
        try {
          const jwksUri =
            provider.type === 'custom'
              ? provider.jwks_uri
              : await resolveJwksUri(issuer);

          await validateTokenSignature(header, signingInput, signatureB64, jwksUri, header.kid);

          if (provider.type === 'github') {
            await validateGithubToken(payload, provider);
          } else if (provider.type === 'bitbucket') {
            await validateBitbucketToken(payload, provider);
          } else {
            await validateCustomToken(payload, provider);
          }

          return { valid: true, payload };
        } catch {
          // Try next provider
          continue;
        }
      }

      return { valid: false, error: 'Token did not pass validation for any configured provider' };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'JWT validation error' };
    }
  }
}
