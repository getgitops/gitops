import crypto from 'crypto';
import type { AuthProviderDomain } from '../domain/auth-provider.domain';
import type { UserDomain } from '../domain/user.domain';
import type { UserAccessDomain } from '../domain/user-access.domain';
import type { AuthProviderRepository } from '../infrastructure/repositories/auth-provider.repository';
import type { UserAccessRepository } from '../infrastructure/repositories/user-access.repository';
import type { UserRepository } from '../infrastructure/repositories/user.repository';
import type { GoogleOidcClient } from '../infrastructure/oidc/google-oidc.client';
import type { SecretCipherService } from './secret-cipher.service';

const GOOGLE = 'google';
const SECRET_PURPOSE = 'sso:google:client-secret';
const FLOW_TTL_MS = 10 * 60 * 1000;
const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type SsoErrorCode =
  | 'not_configured'
  | 'invalid_state'
  | 'provider_error'
  | 'email_not_verified'
  | 'domain_not_allowed'
  | 'not_invited'
  | 'account_disabled';

/** Sign-in failure with a stable code the login page maps to a user-facing message. */
export class SsoError extends Error {
  constructor(
    public readonly code: SsoErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type GoogleSsoSettingsView = {
  enabled: boolean;
  clientId: string | null;
  hasClientSecret: boolean;
  allowedDomains: string[];
};

export type GoogleSsoSettingsInput = {
  enabled: boolean;
  clientId: string;
  /** empty keeps the stored secret, so the UI never has to receive it back */
  clientSecret?: string;
  allowedDomains: string[];
};

type SsoFlow = {
  state: string;
  nonce: string;
  codeVerifier: string;
  organizationId: string;
  organizationSlug: string;
  expiresAt: number;
};

export class SsoService {
  constructor(
    private readonly authProviderRepository: Pick<
      AuthProviderRepository,
      'findByOrganization' | 'findEnabled' | 'upsert'
    >,
    private readonly userRepository: Pick<
      UserRepository,
      | 'findByAuthProvider'
      | 'findByEmail'
      | 'updateAuthProviders'
      | 'activateInvitedUser'
      | 'touchLastLogin'
    >,
    private readonly userAccessRepository: Pick<UserAccessRepository, 'findByUserId' | 'update'>,
    private readonly secretCipher: Pick<SecretCipherService, 'encrypt' | 'decrypt'>,
    private readonly googleClient: Pick<GoogleOidcClient, 'buildAuthorizationUrl' | 'exchangeCode'>,
    private readonly signingKey: () => string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getGoogleSettings(organizationId: string): Promise<GoogleSsoSettingsView> {
    const provider = await this.authProviderRepository.findByOrganization(organizationId, GOOGLE);
    return this.toSettingsView(provider);
  }

  async saveGoogleSettings(
    organizationId: string,
    input: GoogleSsoSettingsInput,
  ): Promise<GoogleSsoSettingsView> {
    const clientId = input.clientId.trim();
    const clientSecret = input.clientSecret?.trim() ?? '';
    const allowedDomains = [
      ...new Set(input.allowedDomains.map((domain) => domain.trim().toLowerCase()).filter(Boolean)),
    ];

    const invalidDomain = allowedDomains.find((domain) => !DOMAIN_PATTERN.test(domain));
    if (invalidDomain) throw new Error(`"${invalidDomain}" is not a valid domain`);

    const existing = await this.authProviderRepository.findByOrganization(organizationId, GOOGLE);
    if (input.enabled) {
      if (!clientId) throw new Error('Google Client ID is required to enable Google sign-in');
      if (!clientSecret && !existing?.clientSecretEncrypted) {
        throw new Error('Google Client Secret is required to enable Google sign-in');
      }
    }

    const updated = await this.authProviderRepository.upsert(organizationId, GOOGLE, {
      enabled: input.enabled,
      clientId: clientId || null,
      allowedDomains,
      ...(clientSecret
        ? { clientSecretEncrypted: this.secretCipher.encrypt(clientSecret, SECRET_PURPOSE) }
        : {}),
    });
    return this.toSettingsView(updated);
  }

  async isGoogleEnabled(organizationId: string): Promise<boolean> {
    const provider = await this.authProviderRepository.findByOrganization(organizationId, GOOGLE);
    return provider?.isUsable ?? false;
  }

  async findSoleGoogleOrganizationId(): Promise<string | null> {
    const usable = (await this.authProviderRepository.findEnabled(GOOGLE)).filter(
      (provider) => provider.isUsable,
    );
    return usable.length === 1 ? usable[0].organizationId : null;
  }

  async startGoogleSignIn(input: {
    organization: { id: string; slug: string };
    redirectUri: string;
  }): Promise<{ authorizationUrl: string; flowCookie: string }> {
    const provider = await this.requireUsableProvider(input.organization.id);

    const flow: SsoFlow = {
      state: this.randomToken(),
      nonce: this.randomToken(),
      codeVerifier: this.randomToken(),
      organizationId: input.organization.id,
      organizationSlug: input.organization.slug,
      expiresAt: this.now() + FLOW_TTL_MS,
    };

    const authorizationUrl = this.googleClient.buildAuthorizationUrl({
      clientId: provider.clientId!,
      redirectUri: input.redirectUri,
      state: flow.state,
      nonce: flow.nonce,
      codeChallenge: crypto.createHash('sha256').update(flow.codeVerifier).digest('base64url'),
      hostedDomain: provider.allowedDomains.length === 1 ? provider.allowedDomains[0] : undefined,
    });

    return { authorizationUrl, flowCookie: this.signFlow(flow) };
  }

  peekFlowOrganization(flowCookie: string | undefined): string | null {
    return this.readFlow(flowCookie)?.organizationSlug ?? null;
  }

  async completeGoogleSignIn(input: {
    flowCookie: string | undefined;
    state: string;
    code: string;
    redirectUri: string;
  }): Promise<{ userId: string; organizationSlug: string }> {
    const flow = this.readFlow(input.flowCookie);
    if (!flow || !input.state || !this.safeEqual(flow.state, input.state)) {
      throw new SsoError('invalid_state', 'The sign-in request expired or was tampered with');
    }
    if (!input.code) throw new SsoError('provider_error', 'Google did not return a code');

    const provider = await this.requireUsableProvider(flow.organizationId);

    let claims;
    try {
      claims = await this.googleClient.exchangeCode({
        clientId: provider.clientId!,
        clientSecret: this.secretCipher.decrypt(provider.clientSecretEncrypted!, SECRET_PURPOSE),
        code: input.code,
        codeVerifier: flow.codeVerifier,
        redirectUri: input.redirectUri,
      });
    } catch (error) {
      throw new SsoError(
        'provider_error',
        error instanceof Error ? error.message : 'Google sign-in failed',
      );
    }

    if (!claims.nonce || !this.safeEqual(claims.nonce, flow.nonce)) {
      throw new SsoError('invalid_state', 'ID token nonce mismatch');
    }
    const email = claims.email?.trim().toLowerCase();
    if (!email || !claims.email_verified) {
      throw new SsoError('email_not_verified', 'Google account email is not verified');
    }
    if (!provider.allowsHostedDomain(claims.hd)) {
      throw new SsoError('domain_not_allowed', 'Google account domain is not allowed');
    }

    const user =
      (await this.userRepository.findByAuthProvider(GOOGLE, claims.sub)) ??
      (await this.userRepository.findByEmail(email));
    if (!user) throw new SsoError('not_invited', 'No invited account for this Google identity');
    if (user.disabled) throw new SsoError('account_disabled', 'Account is disabled');

    const access = await this.userAccessRepository.findByUserId(user.id);
    if (!access.some((entry) => this.belongsToOrganization(entry, flow.organizationId))) {
      throw new SsoError('not_invited', 'Account has no access to this organization');
    }

    await this.linkGoogleIdentity(user, claims.sub);
    if (user.status === 'invited') await this.acceptPendingInvitation(user.id, access);
    await this.userRepository.touchLastLogin(user.id);

    return { userId: user.id, organizationSlug: flow.organizationSlug };
  }

  private async requireUsableProvider(organizationId: string): Promise<AuthProviderDomain> {
    const provider = await this.authProviderRepository.findByOrganization(organizationId, GOOGLE);
    if (!provider?.isUsable) {
      throw new SsoError('not_configured', 'Google sign-in is not enabled for this organization');
    }
    return provider;
  }

  private async linkGoogleIdentity(user: UserDomain, sub: string): Promise<void> {
    if (user.hasAuthProvider(GOOGLE, sub)) return;
    await this.userRepository.updateAuthProviders(user.id, [
      ...user.authProviders.filter((entry) => entry.provider !== GOOGLE),
      { provider: GOOGLE, providerId: sub },
    ]);
  }

  private async acceptPendingInvitation(userId: string, access: UserAccessDomain[]) {
    await this.userRepository.activateInvitedUser(userId);
    await Promise.all(
      access
        .filter((entry) => entry.status === 'invited')
        .map((entry) => this.userAccessRepository.update(entry.id, { status: 'active' })),
    );
  }

  private belongsToOrganization(entry: UserAccessDomain, organizationId: string): boolean {
    if (entry.scope === 'organization') return entry.organizationId === organizationId;
    if (entry.scope === 'project') {
      return (
        entry.organizationId === organizationId ||
        entry.project?.organization?.id === organizationId
      );
    }
    return false;
  }

  private toSettingsView(provider: AuthProviderDomain | null): GoogleSsoSettingsView {
    return {
      enabled: provider?.enabled ?? false,
      clientId: provider?.clientId ?? null,
      hasClientSecret: Boolean(provider?.clientSecretEncrypted),
      allowedDomains: provider ? [...provider.allowedDomains] : [],
    };
  }

  private signFlow(flow: SsoFlow): string {
    const payload = Buffer.from(JSON.stringify(flow)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  private readFlow(cookie: string | undefined): SsoFlow | null {
    if (!cookie) return null;
    const [payload, signature] = cookie.split('.');
    if (!payload || !signature || !this.safeEqual(signature, this.sign(payload))) return null;

    try {
      const flow = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SsoFlow;
      return typeof flow.expiresAt === 'number' && flow.expiresAt > this.now() ? flow : null;
    } catch {
      return null;
    }
  }

  private sign(payload: string): string {
    return crypto
      .createHmac('sha256', this.signingKey())
      .update(`sso-flow:${payload}`)
      .digest('base64url');
  }

  private randomToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}
