import crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { GoogleOidcClient } from './google-oidc.client';

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const NOW = Date.UTC(2026, 0, 1);

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' };

function sign(payload: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'RS256', kid: 'key-1', typ: 'JWT', ...header });
  const body = encode(payload);
  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey)
    .toString('base64url');
  return `${head}.${body}.${signature}`;
}

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-sub-1',
    email: 'ana@gigigo.com',
    email_verified: true,
    hd: 'gigigo.com',
    nonce: 'nonce-1',
    exp: Math.floor(NOW / 1000) + 300,
    ...overrides,
  };
}

function jwksFetch() {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { 'cache-control': 'public, max-age=3600' },
      }),
  );
}

describe('GoogleOidcClient', () => {
  describe('verifyIdToken', () => {
    it('accepts a valid Google ID token', async () => {
      const client = new GoogleOidcClient(jwksFetch(), () => NOW);
      const result = await client.verifyIdToken(sign(claims()), CLIENT_ID);

      expect(result).toMatchObject({
        sub: 'google-sub-1',
        email: 'ana@gigigo.com',
        email_verified: true,
        hd: 'gigigo.com',
        nonce: 'nonce-1',
      });
    });

    it('rejects a token signed with another key', async () => {
      const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
      const token = sign(claims());
      const [head, body] = token.split('.');
      const forged = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), other);

      const client = new GoogleOidcClient(jwksFetch(), () => NOW);
      await expect(
        client.verifyIdToken(`${head}.${body}.${forged.toString('base64url')}`, CLIENT_ID),
      ).rejects.toThrow(/signature/);
    });

    it('rejects a tampered payload', async () => {
      const [head, , signature] = sign(claims()).split('.');
      const body = Buffer.from(JSON.stringify(claims({ email: 'admin@gigigo.com' }))).toString(
        'base64url',
      );

      const client = new GoogleOidcClient(jwksFetch(), () => NOW);
      await expect(client.verifyIdToken(`${head}.${body}.${signature}`, CLIENT_ID)).rejects.toThrow(
        /signature/,
      );
    });

    it('rejects a token issued for another client', async () => {
      const client = new GoogleOidcClient(jwksFetch(), () => NOW);
      await expect(
        client.verifyIdToken(sign(claims({ aud: 'someone-else' })), CLIENT_ID),
      ).rejects.toThrow(/audience/);
    });

    it('rejects a token from another issuer', async () => {
      const client = new GoogleOidcClient(jwksFetch(), () => NOW);
      await expect(
        client.verifyIdToken(sign(claims({ iss: 'https://evil.example.com' })), CLIENT_ID),
      ).rejects.toThrow(/issuer/);
    });

    it('rejects an expired token', async () => {
      const client = new GoogleOidcClient(jwksFetch(), () => NOW);
      await expect(
        client.verifyIdToken(sign(claims({ exp: Math.floor(NOW / 1000) - 120 })), CLIENT_ID),
      ).rejects.toThrow(/expired/);
    });

    it('rejects non-RS256 tokens', async () => {
      const client = new GoogleOidcClient(jwksFetch(), () => NOW);
      await expect(
        client.verifyIdToken(sign(claims(), { alg: 'none' }), CLIENT_ID),
      ).rejects.toThrow(/algorithm/);
    });

    it('caches the JWKS and refetches once for an unknown kid', async () => {
      const fetchFn = jwksFetch();
      const client = new GoogleOidcClient(fetchFn, () => NOW);

      await client.verifyIdToken(sign(claims()), CLIENT_ID);
      await client.verifyIdToken(sign(claims()), CLIENT_ID);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      await expect(
        client.verifyIdToken(sign(claims(), { kid: 'rotated' }), CLIENT_ID),
      ).rejects.toThrow(/signing key/);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  it('builds a PKCE authorization URL', () => {
    const client = new GoogleOidcClient(jwksFetch(), () => NOW);
    const url = new URL(
      client.buildAuthorizationUrl({
        clientId: CLIENT_ID,
        redirectUri: 'https://gitops.local/auth/sso/google/callback',
        state: 'state-1',
        nonce: 'nonce-1',
        codeChallenge: 'challenge',
        hostedDomain: 'gigigo.com',
      }),
    );

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('hd')).toBe('gigigo.com');
  });

  it('exchanges the code and verifies the returned ID token', async () => {
    const idToken = sign(claims());
    const fetchFn = vi.fn(async (input: string, _init?: Parameters<typeof fetch>[1]) =>
      input.includes('/token')
        ? new Response(JSON.stringify({ id_token: idToken }))
        : new Response(JSON.stringify({ keys: [jwk] })),
    );
    const client = new GoogleOidcClient(fetchFn, () => NOW);

    const result = await client.exchangeCode({
      clientId: CLIENT_ID,
      clientSecret: 'secret',
      code: 'code-1',
      codeVerifier: 'verifier',
      redirectUri: 'https://gitops.local/auth/sso/google/callback',
    });

    expect(result.sub).toBe('google-sub-1');
    const body = fetchFn.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('code_verifier')).toBe('verifier');
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('surfaces a failed token exchange', async () => {
    const client = new GoogleOidcClient(
      vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })),
      () => NOW,
    );

    await expect(
      client.exchangeCode({
        clientId: CLIENT_ID,
        clientSecret: 'secret',
        code: 'bad',
        codeVerifier: 'verifier',
        redirectUri: 'https://gitops.local/cb',
      }),
    ).rejects.toThrow(/invalid_grant/);
  });
});
