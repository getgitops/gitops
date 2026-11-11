import crypto from 'crypto';
import type { GoogleSsoConfig } from '../domain/google-sso-config.domain';
import type { UserDomain } from '../domain/user.domain';
import type { UserAccessRepository } from '../infrastructure/repositories/user-access.repository';
import type { UserRepository } from '../infrastructure/repositories/user.repository';
import type { GoogleOidcClient } from '../infrastructure/oidc/google-oidc.client';
import type { UserAccessService } from './user-access.service';

const GOOGLE = 'google';
const FLOW_TTL_MS = 10 * 60 * 1000;

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

/** What organization admins may see of the cluster-wide setup: never the client credentials. */
export type GoogleSsoStatus = {
  enabled: boolean;
  allowedDomains: string[];
  autoProvision: boolean;
};

type SsoFlow = {
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
};

export class SsoService {
  constructor(
    /** returns null when Google sign-in is not configured; throws when misconfigured */
    private readonly readConfig: () => GoogleSsoConfig | null,
    private readonly userRepository: Pick<
      UserRepository,
      | 'findByAuthProvider'
      | 'findByEmail'
      | 'updateAuthProviders'
      | 'activateInvitedUser'
      | 'touchLastLogin'
    >,
    private readonly userAccessRepository: Pick<UserAccessRepository, 'findByUserId' | 'update'>,
    private readonly userProvisioner: Pick<UserAccessService, 'provisionClusterUser'>,
    private readonly googleClient: Pick<GoogleOidcClient, 'buildAuthorizationUrl' | 'exchangeCode'>,
    private readonly signingKey: () => string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** A misconfigured provider counts as disabled, so the login page never breaks because of it. */
  isGoogleEnabled(): boolean {
    return this.tryReadConfig() !== null;
  }

  getGoogleStatus(): GoogleSsoStatus {
    const config = this.tryReadConfig();
    return {
      enabled: config !== null,
      allowedDomains: config ? [...config.allowedDomains] : [],
      autoProvision: config?.autoProvision ?? false,
    };
  }

  startGoogleSignIn(input: { redirectUri: string }): {
    authorizationUrl: string;
    flowCookie: string;
  } {
    const config = this.requireConfig();

    const flow: SsoFlow = {
      state: this.randomToken(),
      nonce: this.randomToken(),
      codeVerifier: this.randomToken(),
      expiresAt: this.now() + FLOW_TTL_MS,
    };

    const authorizationUrl = this.googleClient.buildAuthorizationUrl({
      clientId: config.clientId,
      redirectUri: input.redirectUri,
      state: flow.state,
      nonce: flow.nonce,
      codeChallenge: crypto.createHash('sha256').update(flow.codeVerifier).digest('base64url'),
      hostedDomain: config.allowedDomains.length === 1 ? config.allowedDomains[0] : undefined,
    });

    return { authorizationUrl, flowCookie: this.signFlow(flow) };
  }

  async completeGoogleSignIn(input: {
    flowCookie: string | undefined;
    state: string;
    code: string;
    redirectUri: string;
  }): Promise<{ userId: string }> {
    const flow = this.readFlow(input.flowCookie);
    if (!flow || !input.state || !this.safeEqual(flow.state, input.state)) {
      throw new SsoError('invalid_state', 'The sign-in request expired or was tampered with');
    }
    if (!input.code) throw new SsoError('provider_error', 'Google did not return a code');

    const config = this.requireConfig();

    let claims;
    try {
      claims = await this.googleClient.exchangeCode({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
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
    if (!config.allowsHostedDomain(claims.hd)) {
      throw new SsoError('domain_not_allowed', 'Google account domain is not allowed');
    }

    let user =
      (await this.userRepository.findByAuthProvider(GOOGLE, claims.sub)) ??
      (await this.userRepository.findByEmail(email));
    if (user?.disabled) throw new SsoError('account_disabled', 'Account is disabled');

    if (!user) {
      if (!config.allowsAutoProvision(claims.hd)) {
        throw new SsoError('not_invited', 'No account for this Google identity');
      }
      user = await this.provisionUser(email);
    }

    await this.linkGoogleIdentity(user, claims.sub);
    if (user.status === 'invited') await this.acceptPendingInvitation(user.id);
    await this.userRepository.touchLastLogin(user.id);

    return { userId: user.id };
  }

  private tryReadConfig(): GoogleSsoConfig | null {
    try {
      return this.readConfig();
    } catch {
      return null;
    }
  }

  private requireConfig(): GoogleSsoConfig {
    let config: GoogleSsoConfig | null;
    try {
      config = this.readConfig();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new SsoError('not_configured', `Google sign-in is misconfigured: ${reason}`);
    }
    if (!config) throw new SsoError('not_configured', 'Google sign-in is not enabled');
    return config;
  }

  private async provisionUser(email: string): Promise<UserDomain> {
    try {
      return await this.userProvisioner.provisionClusterUser(email);
    } catch {
      throw new SsoError('not_invited', 'Automatic sign-up failed for this Google identity');
    }
  }

  private async linkGoogleIdentity(user: UserDomain, sub: string): Promise<void> {
    if (user.hasAuthProvider(GOOGLE, sub)) return;
    await this.userRepository.updateAuthProviders(user.id, [
      ...user.authProviders.filter((entry) => entry.provider !== GOOGLE),
      { provider: GOOGLE, providerId: sub },
    ]);
  }

  /** Google has verified the invited email, which is what the invitation link proves. */
  private async acceptPendingInvitation(userId: string): Promise<void> {
    await this.userRepository.activateInvitedUser(userId);
    const access = await this.userAccessRepository.findByUserId(userId);
    await Promise.all(
      access
        .filter((entry) => entry.status === 'invited')
        .map((entry) => this.userAccessRepository.update(entry.id, { status: 'active' })),
    );
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
