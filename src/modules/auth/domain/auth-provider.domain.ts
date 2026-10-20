import { Domain } from './domain';

export type AuthProviderType = 'google';

export class AuthProviderDomain extends Domain {
  public organizationId: string = '';
  public provider: AuthProviderType = 'google';
  public enabled: boolean = false;
  public clientId: string | null = null;
  public clientSecretEncrypted: string | null = null;
  public allowedDomains: string[] = [];
  /** signs up any verified account of an allowed domain without an invitation */
  public autoProvision: boolean = false;
  public autoProvisionRoleId: string | null = null;

  constructor(data: any) {
    super(data);
    this.organizationId = data.organizationId;
    this.provider = data.provider;
    this.enabled = Boolean(data.enabled);
    this.clientId = data.clientId ?? null;
    this.clientSecretEncrypted = data.clientSecretEncrypted ?? null;
    this.allowedDomains = Array.isArray(data.allowedDomains)
      ? data.allowedDomains.map((domain: unknown) => String(domain).toLowerCase())
      : [];
    this.autoProvision = Boolean(data.autoProvision);
    this.autoProvisionRoleId = data.autoProvisionRoleId ?? null;
  }

  get isUsable(): boolean {
    return this.enabled && Boolean(this.clientId) && Boolean(this.clientSecretEncrypted);
  }

  allowsHostedDomain(hostedDomain: string | null | undefined): boolean {
    if (this.allowedDomains.length === 0) return true;
    return Boolean(hostedDomain) && this.allowedDomains.includes(hostedDomain!.toLowerCase());
  }

  /** Auto-provisioning is only honoured when restricted to Workspace domains, never for any Google account. */
  allowsAutoProvision(hostedDomain: string | null | undefined): boolean {
    return (
      this.autoProvision &&
      Boolean(this.autoProvisionRoleId) &&
      this.allowedDomains.length > 0 &&
      this.allowsHostedDomain(hostedDomain)
    );
  }

  toJson() {
    return {
      id: this.id,
      organizationId: this.organizationId,
      provider: this.provider,
      enabled: this.enabled,
      clientId: this.clientId,
      hasClientSecret: Boolean(this.clientSecretEncrypted),
      allowedDomains: [...this.allowedDomains],
      autoProvision: this.autoProvision,
      autoProvisionRoleId: this.autoProvisionRoleId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
