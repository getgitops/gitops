import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SsoError, SsoService } from './sso.service';
import { AuthProviderDomain } from '../domain/auth-provider.domain';
import { UserDomain, type UserAuthProvider } from '../domain/user.domain';
import { UserAccessDomain } from '../domain/user-access.domain';
import type { GoogleIdTokenClaims } from '../infrastructure/oidc/google-oidc.client';

const ORG = { id: 'org-1', slug: 'gitops' };
const OTHER_ORG_ID = 'org-2';
const REDIRECT_URI = 'https://gitops.local/auth/sso/google/callback';
const TIMESTAMPS = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

class FakeAuthProviderRepository {
  rows: AuthProviderDomain[] = [];

  async findByOrganization(organizationId: string, provider: string) {
    return (
      this.rows.find((row) => row.organizationId === organizationId && row.provider === provider) ??
      null
    );
  }

  async findEnabled(provider: string) {
    return this.rows.filter((row) => row.provider === provider && row.enabled);
  }

  async upsert(organizationId: string, provider: 'google', changes: Record<string, unknown>) {
    const existing = await this.findByOrganization(organizationId, provider);
    const next = new AuthProviderDomain({
      id: existing?.id ?? `provider-${this.rows.length + 1}`,
      organizationId,
      provider,
      enabled: existing?.enabled ?? false,
      clientId: existing?.clientId ?? null,
      clientSecretEncrypted: existing?.clientSecretEncrypted ?? null,
      allowedDomains: existing?.allowedDomains ?? [],
      ...changes,
      ...TIMESTAMPS,
    });
    this.rows = [...this.rows.filter((row) => row !== existing), next];
    return next;
  }
}

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

const fakeCipher = {
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ''),
};

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
    organizationId: ORG.id,
    status: 'active',
    ...TIMESTAMPS,
    ...overrides,
  });
}

describe('SsoService', () => {
  let providers: FakeAuthProviderRepository;
  let users: FakeUserRepository;
  let accesses: FakeUserAccessRepository;
  let googleClaims: GoogleIdTokenClaims;
  let googleClient: {
    buildAuthorizationUrl: ReturnType<typeof vi.fn>;
    exchangeCode: ReturnType<typeof vi.fn>;
  };
  let now: number;
  let service: SsoService;

  beforeEach(async () => {
    providers = new FakeAuthProviderRepository();
    users = new FakeUserRepository();
    accesses = new FakeUserAccessRepository();
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
      providers as any,
      users as any,
      accesses as any,
      fakeCipher,
      googleClient as any,
      () => 'signing-key',
      () => now,
    );

    await service.saveGoogleSettings(ORG.id, {
      enabled: true,
      clientId: 'client-123',
      clientSecret: 'super-secret',
      allowedDomains: ['gigigo.com'],
    });
    users.rows.push(user());
    accesses.rows.push(access());
  });

  function lastNonce() {
    const url = googleClient.buildAuthorizationUrl.mock.results.at(-1)?.value as string;
    return new URL(url).searchParams.get('nonce') ?? undefined;
  }

  async function signIn(overrides: { state?: string; flowCookie?: string } = {}) {
    const started = await service.startGoogleSignIn({
      organization: ORG,
      redirectUri: REDIRECT_URI,
    });
    const state = new URL(started.authorizationUrl).searchParams.get('state')!;
    return service.completeGoogleSignIn({
      flowCookie: overrides.flowCookie ?? started.flowCookie,
      state: overrides.state ?? state,
      code: 'auth-code',
      redirectUri: REDIRECT_URI,
    });
  }

  async function expectSsoError(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toBeInstanceOf(SsoError);
    await expect(promise).rejects.toMatchObject({ code });
  }

  describe('settings', () => {
    it('stores the client secret encrypted and never returns it', async () => {
      const view = await service.getGoogleSettings(ORG.id);

      expect(view).toEqual({
        enabled: true,
        clientId: 'client-123',
        hasClientSecret: true,
        allowedDomains: ['gigigo.com'],
      });
      expect(JSON.stringify(view)).not.toContain('super-secret');
      expect(providers.rows[0].clientSecretEncrypted).toBe('enc:super-secret');
    });

    it('keeps the stored secret when saved with an empty one', async () => {
      await service.saveGoogleSettings(ORG.id, {
        enabled: true,
        clientId: 'client-456',
        clientSecret: '',
        allowedDomains: [],
      });
      expect(providers.rows[0].clientSecretEncrypted).toBe('enc:super-secret');
      expect(providers.rows[0].clientId).toBe('client-456');
    });

    it('normalizes and validates allowed domains', async () => {
      const view = await service.saveGoogleSettings(ORG.id, {
        enabled: true,
        clientId: 'client-123',
        allowedDomains: [' Gigigo.com ', 'gigigo.com', '', 'example.org'],
      });
      expect(view.allowedDomains).toEqual(['gigigo.com', 'example.org']);

      await expect(
        service.saveGoogleSettings(ORG.id, {
          enabled: true,
          clientId: 'client-123',
          allowedDomains: ['not a domain'],
        }),
      ).rejects.toThrow(/valid domain/);
    });

    it('refuses to enable Google without client credentials', async () => {
      await expect(
        service.saveGoogleSettings(OTHER_ORG_ID, {
          enabled: true,
          clientId: 'client-123',
          allowedDomains: [],
        }),
      ).rejects.toThrow(/Client Secret/);
      await expect(
        service.saveGoogleSettings(OTHER_ORG_ID, {
          enabled: true,
          clientId: ' ',
          clientSecret: 'secret',
          allowedDomains: [],
        }),
      ).rejects.toThrow(/Client ID/);
    });

    it('reports whether Google sign-in is usable', async () => {
      expect(await service.isGoogleEnabled(ORG.id)).toBe(true);
      expect(await service.isGoogleEnabled(OTHER_ORG_ID)).toBe(false);

      await service.saveGoogleSettings(ORG.id, {
        enabled: false,
        clientId: 'client-123',
        allowedDomains: [],
      });
      expect(await service.isGoogleEnabled(ORG.id)).toBe(false);
    });
  });

  describe('findSoleGoogleOrganizationId', () => {
    it('returns the organization when it is the only one with Google enabled', async () => {
      expect(await service.findSoleGoogleOrganizationId()).toBe(ORG.id);
    });

    it('returns null when several organizations have Google enabled', async () => {
      await service.saveGoogleSettings(OTHER_ORG_ID, {
        enabled: true,
        clientId: 'client-other',
        clientSecret: 'other-secret',
        allowedDomains: [],
      });
      expect(await service.findSoleGoogleOrganizationId()).toBeNull();
    });

    it('returns null when no organization has Google enabled', async () => {
      await service.saveGoogleSettings(ORG.id, {
        enabled: false,
        clientId: 'client-123',
        allowedDomains: [],
      });
      expect(await service.findSoleGoogleOrganizationId()).toBeNull();
    });
  });

  describe('startGoogleSignIn', () => {
    it('builds a PKCE request with the hosted domain hint', async () => {
      await service.startGoogleSignIn({ organization: ORG, redirectUri: REDIRECT_URI });

      const request = googleClient.buildAuthorizationUrl.mock.calls[0]?.[0];
      expect(request).toMatchObject({
        clientId: 'client-123',
        redirectUri: REDIRECT_URI,
        hostedDomain: 'gigigo.com',
      });
      expect(request.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('fails when the organization has no usable provider', async () => {
      await expectSsoError(
        service.startGoogleSignIn({
          organization: { id: OTHER_ORG_ID, slug: 'other' },
          redirectUri: REDIRECT_URI,
        }),
        'not_configured',
      );
    });
  });

  describe('completeGoogleSignIn', () => {
    it('signs in an invited member and links the Google identity', async () => {
      const result = await signIn();

      expect(result).toEqual({ userId: 'user-1', organizationSlug: 'gitops' });
      expect(users.rows[0].authProviders).toContainEqual({
        provider: 'google',
        providerId: 'google-sub-1',
      });
      expect(users.lastLogins).toEqual(['user-1']);
      const exchange = googleClient.exchangeCode.mock.calls[0]?.[0];
      expect(exchange.clientSecret).toBe('super-secret');
    });

    it('resolves an already linked user by Google subject even if the email changed', async () => {
      users.rows[0].email = 'ana.old@gigigo.com';
      users.rows[0].authProviders.push({ provider: 'google', providerId: 'google-sub-1' });

      await expect(signIn()).resolves.toMatchObject({ userId: 'user-1' });
    });

    it('accepts a pending invitation instead of asking for a password', async () => {
      users.rows[0].status = 'invited';
      accesses.rows[0].status = 'invited';

      await signIn();

      expect(users.activated).toEqual(['user-1']);
      expect(accesses.rows[0].status).toBe('active');
    });

    it('accepts users whose only access is to a project of the organization', async () => {
      accesses.rows = [
        access({
          scope: 'project',
          organizationId: null,
          projectId: 'project-1',
          project: {
            id: 'project-1',
            name: 'P',
            slug: 'p',
            organization: { id: ORG.id, ...TIMESTAMPS },
            ...TIMESTAMPS,
          },
        }),
      ];

      await expect(signIn()).resolves.toMatchObject({ userId: 'user-1' });
    });

    it('rejects users with no account', async () => {
      users.rows = [];
      await expectSsoError(signIn(), 'not_invited');
    });

    it('rejects users invited only to another organization', async () => {
      accesses.rows = [access({ organizationId: OTHER_ORG_ID })];
      await expectSsoError(signIn(), 'not_invited');
      expect(users.rows[0].authProviders).not.toContainEqual(
        expect.objectContaining({ provider: 'google' }),
      );
    });

    it('rejects disabled accounts', async () => {
      users.rows[0].disabled = true;
      await expectSsoError(signIn(), 'account_disabled');
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
      await service.saveGoogleSettings(ORG.id, {
        enabled: true,
        clientId: 'client-123',
        allowedDomains: [],
      });
      delete googleClaims.hd;
      await expect(signIn()).resolves.toMatchObject({ userId: 'user-1' });
    });

    it('rejects a mismatched state', async () => {
      await expectSsoError(signIn({ state: 'forged' }), 'invalid_state');
      expect(googleClient.exchangeCode).not.toHaveBeenCalled();
    });

    it('rejects a tampered flow cookie', async () => {
      const started = await service.startGoogleSignIn({
        organization: ORG,
        redirectUri: REDIRECT_URI,
      });
      const [payload] = started.flowCookie.split('.');
      await expectSsoError(signIn({ flowCookie: `${payload}.forged` }), 'invalid_state');
    });

    it('rejects an expired flow', async () => {
      const started = await service.startGoogleSignIn({
        organization: ORG,
        redirectUri: REDIRECT_URI,
      });
      const state = new URL(started.authorizationUrl).searchParams.get('state')!;
      now += 11 * 60 * 1000;

      await expectSsoError(
        service.completeGoogleSignIn({
          flowCookie: started.flowCookie,
          state,
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

    it('fails when the provider was disabled mid-flow', async () => {
      const started = await service.startGoogleSignIn({
        organization: ORG,
        redirectUri: REDIRECT_URI,
      });
      const state = new URL(started.authorizationUrl).searchParams.get('state')!;
      await service.saveGoogleSettings(ORG.id, {
        enabled: false,
        clientId: 'client-123',
        allowedDomains: [],
      });

      await expectSsoError(
        service.completeGoogleSignIn({
          flowCookie: started.flowCookie,
          state,
          code: 'auth-code',
          redirectUri: REDIRECT_URI,
        }),
        'not_configured',
      );
    });
  });

  it('exposes the organization of a pending flow', async () => {
    const started = await service.startGoogleSignIn({
      organization: ORG,
      redirectUri: REDIRECT_URI,
    });
    expect(service.peekFlowOrganization(started.flowCookie)).toBe('gitops');
    expect(service.peekFlowOrganization('garbage')).toBeNull();
  });
});
