import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SsoError, SsoService } from './sso.service';
import { GoogleSsoConfig } from '../domain/google-sso-config.domain';
import { UserDomain, type UserAuthProvider } from '../domain/user.domain';
import { UserAccessDomain } from '../domain/user-access.domain';
import type { GoogleIdTokenClaims } from '../infrastructure/oidc/google-oidc.client';

const REDIRECT_URI = 'https://gitops.local/auth/sso/google/callback';
const TIMESTAMPS = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

class FakeUserRepository {
  rows: UserDomain[] = [];
  activated: string[] = [];
  lastLogins: string[] = [];

  async findByAuthProvider(provider: string, providerId: string) {
    return this.rows.find((user) => user.hasAuthProvider(provider, providerId)) ?? null;
  }

  async findByEmail(email: string) {
    return this.rows.find((user) => user.email === email) ?? null;
  }

  async updateAuthProviders(userId: string, authProviders: UserAuthProvider[]) {
    const user = this.rows.find((entry) => entry.id === userId)!;
    user.authProviders = authProviders;
  }

  async activateInvitedUser(userId: string) {
    this.activated.push(userId);
    this.rows.find((entry) => entry.id === userId)!.status = 'active';
  }

  async touchLastLogin(userId: string) {
    this.lastLogins.push(userId);
  }
}

class FakeUserAccessRepository {
  rows: UserAccessDomain[] = [];

  async findByUserId(userId: string) {
    return this.rows.filter((row) => row.userId === userId);
  }

  async update(id: string, changes: { status: 'active' | 'invited' }) {
    const row = this.rows.find((entry) => entry.id === id)!;
    row.status = changes.status;
    return row;
  }
}

/** Mirrors UserAccessService.provisionClusterUser on top of the fake user repository. */
class FakeUserProvisioner {
  calls: string[] = [];

  constructor(private readonly users: FakeUserRepository) {}

  async provisionClusterUser(email: string) {
    this.calls.push(email);
    const created = user({ id: `user-${this.users.rows.length + 1}`, username: 'new', email });
    this.users.rows.push(created);
    return created;
  }
}

function user(overrides: Record<string, unknown> = {}) {
  return new UserDomain({
    id: 'user-1',
    username: 'ana',
    email: 'ana@gigigo.com',
    password: 'hash',
    status: 'active',
    role: null,
    authProviders: [{ provider: 'local', providerId: null }],
    ...TIMESTAMPS,
    ...overrides,
  });
}

function access(overrides: Record<string, unknown> = {}) {
  return new UserAccessDomain({
    id: 'access-1',
    userId: 'user-1',
    roleId: 'role-dev',
    scope: 'organization',
    organizationId: 'org-1',
    status: 'active',
    ...TIMESTAMPS,
    ...overrides,
  });
}

describe('SsoService', () => {
  let config: GoogleSsoConfig | null;
  let configError: Error | null;
  let users: FakeUserRepository;
  let accesses: FakeUserAccessRepository;
  let provisioner: FakeUserProvisioner;
  let googleClaims: GoogleIdTokenClaims;
  let googleClient: {
    buildAuthorizationUrl: ReturnType<typeof vi.fn>;
    exchangeCode: ReturnType<typeof vi.fn>;
  };
  let now: number;
  let service: SsoService;

  beforeEach(() => {
    config = new GoogleSsoConfig('client-123', 'super-secret', ['gigigo.com'], false);
    configError = null;
    users = new FakeUserRepository();
    accesses = new FakeUserAccessRepository();
    provisioner = new FakeUserProvisioner(users);
    now = Date.UTC(2026, 0, 1);
    googleClaims = {
      sub: 'google-sub-1',
      email: 'ana@gigigo.com',
      email_verified: true,
      hd: 'gigigo.com',
    };
    googleClient = {
      buildAuthorizationUrl: vi.fn(
        (request: { state: string; nonce: string }) =>
          `https://accounts.google.com/auth?state=${request.state}&nonce=${request.nonce}`,
      ),
      // echo the nonce from the authorization request, as Google does
      exchangeCode: vi.fn(async () => ({ ...googleClaims, nonce: lastNonce() })),
    };
    service = new SsoService(
      () => {
        if (configError) throw configError;
        return config;
      },
      users as any,
      accesses as any,
      provisioner,
      googleClient as any,
      () => 'signing-key',
      () => now,
    );

    users.rows.push(user());
    accesses.rows.push(access());
  });

  function lastNonce() {
    const url = googleClient.buildAuthorizationUrl.mock.results.at(-1)?.value as string;
    return new URL(url).searchParams.get('nonce') ?? undefined;
  }

  function start() {
    const started = service.startGoogleSignIn({ redirectUri: REDIRECT_URI });
    const state = new URL(started.authorizationUrl).searchParams.get('state')!;
    return { ...started, state };
  }

  async function signIn(overrides: { state?: string; flowCookie?: string } = {}) {
    const started = start();
    return service.completeGoogleSignIn({
      flowCookie: overrides.flowCookie ?? started.flowCookie,
      state: overrides.state ?? started.state,
      code: 'auth-code',
      redirectUri: REDIRECT_URI,
    });
  }

  async function expectSsoError(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toBeInstanceOf(SsoError);
    await expect(promise).rejects.toMatchObject({ code });
  }

  describe('status', () => {
    it('reports the cluster configuration without the client credentials', () => {
      const status = service.getGoogleStatus();

      expect(status).toEqual({
        enabled: true,
        allowedDomains: ['gigigo.com'],
        autoProvision: false,
      });
      expect(JSON.stringify(status)).not.toContain('super-secret');
      expect(JSON.stringify(status)).not.toContain('client-123');
      expect(service.isGoogleEnabled()).toBe(true);
    });

    it('is disabled when Google sign-in is not configured', () => {
      config = null;
      expect(service.isGoogleEnabled()).toBe(false);
      expect(service.getGoogleStatus()).toEqual({
        enabled: false,
        allowedDomains: [],
        autoProvision: false,
      });
    });

    it('treats a misconfigured provider as disabled instead of throwing', () => {
      configError = new Error(
        'GOOGLE_SSO_CLIENT_ID and GOOGLE_SSO_CLIENT_SECRET must be set together',
      );
      expect(service.isGoogleEnabled()).toBe(false);
      expect(service.getGoogleStatus().enabled).toBe(false);
    });
  });

  describe('startGoogleSignIn', () => {
    it('builds a PKCE request with the hosted domain hint', () => {
      start();

      const request = googleClient.buildAuthorizationUrl.mock.calls[0]?.[0];
      expect(request).toMatchObject({
        clientId: 'client-123',
        redirectUri: REDIRECT_URI,
        hostedDomain: 'gigigo.com',
      });
      expect(request.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('omits the hosted domain hint when several domains are allowed', () => {
      config = new GoogleSsoConfig(
        'client-123',
        'super-secret',
        ['gigigo.com', 'example.org'],
        false,
      );
      start();
      expect(googleClient.buildAuthorizationUrl.mock.calls[0]?.[0].hostedDomain).toBeUndefined();
    });

    it('fails when Google sign-in is not configured', () => {
      config = null;
      expect(() => start()).toThrow(SsoError);
      expect(() => start()).toThrow(/not enabled/);
    });

    it('fails with not_configured when it is misconfigured', () => {
      configError = new Error('"bad" is not a valid domain');
      try {
        start();
        expect.unreachable();
      } catch (error) {
        expect(error).toMatchObject({ code: 'not_configured' });
      }
    });
  });

  describe('completeGoogleSignIn', () => {
    it('signs in an existing user and links the Google identity', async () => {
      const result = await signIn();

      expect(result).toEqual({ userId: 'user-1' });
      expect(users.rows[0].authProviders).toContainEqual({
        provider: 'google',
        providerId: 'google-sub-1',
      });
      expect(users.lastLogins).toEqual(['user-1']);
      const exchange = googleClient.exchangeCode.mock.calls[0]?.[0];
      expect(exchange.clientSecret).toBe('super-secret');
    });

    it('signs in users regardless of the organizations they belong to', async () => {
      accesses.rows = [];
      await expect(signIn()).resolves.toEqual({ userId: 'user-1' });
      expect(provisioner.calls).toEqual([]);
    });

    it('resolves an already linked user by Google subject even if the email changed', async () => {
      users.rows[0].email = 'ana.old@gigigo.com';
      users.rows[0].authProviders.push({ provider: 'google', providerId: 'google-sub-1' });

      await expect(signIn()).resolves.toEqual({ userId: 'user-1' });
    });

    it('accepts a pending invitation instead of asking for a password', async () => {
      users.rows[0].status = 'invited';
      accesses.rows = [
        access({ id: 'access-1', status: 'invited' }),
        access({ id: 'access-2', organizationId: 'org-2', status: 'invited' }),
      ];

      await signIn();

      expect(users.activated).toEqual(['user-1']);
      expect(accesses.rows.map((row) => row.status)).toEqual(['active', 'active']);
    });

    it('rejects users with no account', async () => {
      users.rows = [];
      await expectSsoError(signIn(), 'not_invited');
      expect(provisioner.calls).toEqual([]);
    });

    it('rejects disabled accounts', async () => {
      users.rows[0].disabled = true;
      await expectSsoError(signIn(), 'account_disabled');
      expect(users.lastLogins).toEqual([]);
    });

    it('rejects unverified emails', async () => {
      googleClaims.email_verified = false;
      await expectSsoError(signIn(), 'email_not_verified');
    });

    it('rejects accounts outside the allowed Workspace domains', async () => {
      googleClaims.hd = 'evil.com';
      await expectSsoError(signIn(), 'domain_not_allowed');
    });

    it('does not trust the email suffix without the hd claim', async () => {
      delete googleClaims.hd;
      await expectSsoError(signIn(), 'domain_not_allowed');
    });

    it('accepts any verified account when no domain is restricted', async () => {
      config = new GoogleSsoConfig('client-123', 'super-secret', [], false);
      delete googleClaims.hd;
      await expect(signIn()).resolves.toEqual({ userId: 'user-1' });
    });

    describe('with automatic sign-up', () => {
      beforeEach(() => {
        config = new GoogleSsoConfig('client-123', 'super-secret', ['gigigo.com'], true);
      });

      it('creates a cluster user for a new Workspace account of an allowed domain', async () => {
        users.rows = [];

        const result = await signIn();

        expect(provisioner.calls).toEqual(['ana@gigigo.com']);
        expect(users.rows[0].authProviders).toContainEqual({
          provider: 'google',
          providerId: 'google-sub-1',
        });
        expect(users.lastLogins).toEqual([result.userId]);
      });

      it('does not provision users that already exist', async () => {
        await signIn();
        expect(provisioner.calls).toEqual([]);
      });

      it('still rejects disabled accounts', async () => {
        users.rows[0].disabled = true;
        await expectSsoError(signIn(), 'account_disabled');
        expect(provisioner.calls).toEqual([]);
      });

      it('still rejects accounts outside the allowed domains', async () => {
        users.rows = [];
        googleClaims.hd = 'evil.com';
        await expectSsoError(signIn(), 'domain_not_allowed');
        expect(provisioner.calls).toEqual([]);
      });

      it('never provisions a personal account without the hd claim', async () => {
        users.rows = [];
        delete googleClaims.hd;
        await expectSsoError(signIn(), 'domain_not_allowed');
        expect(provisioner.calls).toEqual([]);
      });

      it('fails closed when provisioning fails', async () => {
        users.rows = [];
        provisioner.provisionClusterUser = async () => {
          throw new Error('GitDB unavailable');
        };
        await expectSsoError(signIn(), 'not_invited');
      });
    });

    it('rejects a mismatched state', async () => {
      await expectSsoError(signIn({ state: 'forged' }), 'invalid_state');
      expect(googleClient.exchangeCode).not.toHaveBeenCalled();
    });

    it('rejects a tampered flow cookie', async () => {
      const [payload] = start().flowCookie.split('.');
      await expectSsoError(signIn({ flowCookie: `${payload}.forged` }), 'invalid_state');
    });

    it('rejects a missing flow cookie', async () => {
      const started = start();
      await expectSsoError(
        service.completeGoogleSignIn({
          flowCookie: undefined,
          state: started.state,
          code: 'auth-code',
          redirectUri: REDIRECT_URI,
        }),
        'invalid_state',
      );
    });

    it('rejects an expired flow', async () => {
      const started = start();
      now += 11 * 60 * 1000;

      await expectSsoError(
        service.completeGoogleSignIn({
          flowCookie: started.flowCookie,
          state: started.state,
          code: 'auth-code',
          redirectUri: REDIRECT_URI,
        }),
        'invalid_state',
      );
    });

    it('rejects a replayed ID token with another nonce', async () => {
      googleClient.exchangeCode.mockResolvedValueOnce({ ...googleClaims, nonce: 'other' });
      await expectSsoError(signIn(), 'invalid_state');
    });

    it('maps Google failures to provider_error', async () => {
      googleClient.exchangeCode.mockRejectedValueOnce(new Error('invalid_grant'));
      await expectSsoError(signIn(), 'provider_error');
    });

    it('fails when Google sign-in was disabled mid-flow', async () => {
      const started = start();
      config = null;

      await expectSsoError(
        service.completeGoogleSignIn({
          flowCookie: started.flowCookie,
          state: started.state,
          code: 'auth-code',
          redirectUri: REDIRECT_URI,
        }),
        'not_configured',
      );
    });
  });
});
