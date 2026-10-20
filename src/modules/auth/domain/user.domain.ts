import { Domain } from './domain';
import { RoleDomain } from './role.domain';

export type UserAuthProvider = { provider: string; providerId: string | null };

export class UserDomain extends Domain {
  public username: string = '';
  public email: string | null = null;
  public password: string = '';
  public role: RoleDomain | null = null;
  public status: 'active' | 'invited' = 'active';
  public invitationExpiresAt: Date | null = null;
  public passwordResetExpiresAt: Date | null = null;
  public authProviders: UserAuthProvider[] = [];
  public disabled: boolean = false;
  constructor(data: any) {
    super(data);
    this.username = data.username;
    this.email = data.email;
    this.password = data.password;
    this.status = data.status === 'invited' ? 'invited' : 'active';
    this.invitationExpiresAt = data.invitationExpiresAt ? new Date(data.invitationExpiresAt) : null;
    this.passwordResetExpiresAt = data.passwordResetExpiresAt
      ? new Date(data.passwordResetExpiresAt)
      : null;
    this.role = data.role ? new RoleDomain(data.role) : null;
    this.authProviders = Array.isArray(data.authProviders) ? data.authProviders : [];
    this.disabled = Boolean(data.disabled);
  }

  hasAuthProvider(provider: string, providerId: string): boolean {
    return this.authProviders.some(
      (entry) => entry.provider === provider && entry.providerId === providerId,
    );
  }

  toJson() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      role: this.role ? this.role.toJson() : null,
      status: this.status,
      createdAt: this.createdAt,
    };
  }
}
