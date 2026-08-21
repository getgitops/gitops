import { Domain } from './domain';
import { RoleDomain } from './role.domain';

export class UserDomain extends Domain {
  public username: string = '';
  public email: string | null = null;
  public password: string = '';
  public role: RoleDomain | null = null;
  public status: 'active' | 'invited' = 'active';
  constructor(data: any) {
    super(data);
    this.username = data.username;
    this.email = data.email;
    this.password = data.password;
    this.status = data.status === 'invited' ? 'invited' : 'active';
    this.role = data.role ? new RoleDomain(data.role) : null;
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
