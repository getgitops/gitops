const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Cluster-wide Google sign-in settings, sourced from the GOOGLE_SSO_* environment variables. */
export class GoogleSsoConfig {
  readonly allowedDomains: readonly string[];

  constructor(
    readonly clientId: string,
    readonly clientSecret: string,
    allowedDomains: readonly string[],
    /** signs up any verified account of an allowed Workspace domain without an invitation */
    readonly autoProvision: boolean,
  ) {
    if (!clientId.trim()) throw new Error('Google Client ID is required');
    if (!clientSecret.trim()) throw new Error('Google Client Secret is required');

    const normalized = [
      ...new Set(allowedDomains.map((domain) => domain.trim().toLowerCase()).filter(Boolean)),
    ];
    const invalid = normalized.find((domain) => !DOMAIN_PATTERN.test(domain));
    if (invalid) throw new Error(`"${invalid}" is not a valid domain`);
    if (autoProvision && normalized.length === 0) {
      throw new Error('Automatic sign-up requires at least one allowed Workspace domain');
    }
    this.allowedDomains = normalized;
  }

  allowsHostedDomain(hostedDomain: string | null | undefined): boolean {
    if (this.allowedDomains.length === 0) return true;
    return Boolean(hostedDomain) && this.allowedDomains.includes(hostedDomain!.toLowerCase());
  }

  /** Only Workspace accounts (`hd` claim) of an allowed domain, never any Google account. */
  allowsAutoProvision(hostedDomain: string | null | undefined): boolean {
    return (
      this.autoProvision && this.allowedDomains.length > 0 && this.allowsHostedDomain(hostedDomain)
    );
  }
}
