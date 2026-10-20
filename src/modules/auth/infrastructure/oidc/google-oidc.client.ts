import crypto from 'crypto';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const CLOCK_SKEW_SECONDS = 60;
const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000;

export type GoogleIdTokenClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  hd?: string;
  name?: string;
  nonce?: string;
};

export type GoogleAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  hostedDomain?: string;
};

export type GoogleCodeExchange = {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

type Jwk = crypto.webcrypto.JsonWebKey & { kid?: string };
type FetchLike = (input: string, init?: Parameters<typeof fetch>[1]) => Promise<Response>;

export class GoogleOidcError extends Error {}

export class GoogleOidcClient {
  private jwks: { keys: Jwk[]; expiresAt: number } | null = null;

  constructor(
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => number = () => Date.now(),
  ) {}

  buildAuthorizationUrl(request: GoogleAuthorizationRequest): string {
    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.searchParams.set('client_id', request.clientId);
    url.searchParams.set('redirect_uri', request.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', request.state);
    url.searchParams.set('nonce', request.nonce);
    url.searchParams.set('code_challenge', request.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('prompt', 'select_account');
    if (request.hostedDomain) url.searchParams.set('hd', request.hostedDomain);
    return url.toString();
  }

  async exchangeCode(exchange: GoogleCodeExchange): Promise<GoogleIdTokenClaims> {
    const response = await this.fetchFn(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: exchange.code,
        code_verifier: exchange.codeVerifier,
        client_id: exchange.clientId,
        client_secret: exchange.clientSecret,
        redirect_uri: exchange.redirectUri,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      id_token?: string;
      error?: string;
    };
    if (!response.ok || !body.id_token) {
      throw new GoogleOidcError(`Google token exchange failed: ${body.error ?? response.status}`);
    }

    return this.verifyIdToken(body.id_token, exchange.clientId);
  }

  async verifyIdToken(idToken: string, clientId: string): Promise<GoogleIdTokenClaims> {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new GoogleOidcError('Malformed ID token');
    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const header = this.decodeSegment(encodedHeader) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid) {
      throw new GoogleOidcError('Unsupported ID token algorithm');
    }

    const jwk = await this.findKey(header.kid);
    const validSignature = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      crypto.createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(encodedSignature, 'base64url'),
    );
    if (!validSignature) throw new GoogleOidcError('Invalid ID token signature');

    const claims = this.decodeSegment(encodedPayload) as GoogleIdTokenClaims & {
      iss?: string;
      aud?: string | string[];
      exp?: number;
    };
    const nowSeconds = Math.floor(this.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

    if (!claims.iss || !ISSUERS.includes(claims.iss)) {
      throw new GoogleOidcError('Unexpected ID token issuer');
    }
    if (!audiences.includes(clientId)) throw new GoogleOidcError('ID token audience mismatch');
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
      throw new GoogleOidcError('ID token expired');
    }
    if (!claims.sub) throw new GoogleOidcError('ID token has no subject');

    return {
      sub: claims.sub,
      email: claims.email,
      email_verified: claims.email_verified === true || String(claims.email_verified) === 'true',
      hd: claims.hd,
      name: claims.name,
      nonce: claims.nonce,
    };
  }

  private async findKey(kid: string): Promise<Jwk> {
    let key = (await this.loadJwks(false)).find((entry) => entry.kid === kid);
    if (!key) key = (await this.loadJwks(true)).find((entry) => entry.kid === kid);
    if (!key) throw new GoogleOidcError('Unknown ID token signing key');
    return key;
  }

  private async loadJwks(force: boolean): Promise<Jwk[]> {
    if (!force && this.jwks && this.jwks.expiresAt > this.now()) return this.jwks.keys;

    const response = await this.fetchFn(JWKS_URI);
    if (!response.ok) throw new GoogleOidcError(`Failed to fetch Google JWKS: ${response.status}`);
    const body = (await response.json()) as { keys?: Jwk[] };

    const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1];
    this.jwks = {
      keys: Array.isArray(body.keys) ? body.keys : [],
      expiresAt: this.now() + (maxAge ? Number(maxAge) * 1000 : DEFAULT_JWKS_TTL_MS),
    };
    return this.jwks.keys;
  }

  private decodeSegment(segment: string): unknown {
    try {
      return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    } catch {
      throw new GoogleOidcError('Malformed ID token');
    }
  }
}
