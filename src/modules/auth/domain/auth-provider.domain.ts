import { Domain } from './domain';

export type AuthProviderType = 'google';

export class AuthProviderDomain extends Domain {
  public organizationId: string = '';
  public provider: AuthProviderType = 'google';
  public enabled: boolean = false;
  public clientId: string | null = null;
  public clientSecretEncrypted: string | null = null;
  public allowedDomains: string[] = [];

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
  }

  get isUsable(): boolean {
    return this.enabled && Boolean(this.clientId) && Boolean(this.clientSecretEncrypted);
  }

  allowsHostedDomain(hostedDomain: string | null | undefined): boolean {
    if (this.allowedDomains.length === 0) return true;
    return Boolean(hostedDomain) && this.allowedDomains.includes(hostedDomain!.toLowerCase());
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
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
