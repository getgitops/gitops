import crypto from 'crypto';
import type { UserAccessRepository } from '../infrastructure/repositories/user-access.repository';
import type { UserRepository } from '../infrastructure/repositories/user.repository';
import type { PasswordService } from './password.service';

export type InvitationView = {
  userId: string;
  username: string;
  email: string | null;
};

const TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 7;

export class InvitationService {
  constructor(
    private readonly userRepository: Pick<
      UserRepository,
      'findById' | 'findByInvitationTokenHash' | 'setInvitationToken' | 'acceptInvitation'
    >,
    private readonly userAccessRepository: Pick<UserAccessRepository, 'findByUserId' | 'update'>,
    private readonly passwordService: Pick<PasswordService, 'hashPassword'>,
    private readonly ttlDays: number = DEFAULT_TTL_DAYS,
  ) {}

  /** Issues a new token, stores only its hash, and returns the raw token for the invite link. */
  async issueToken(userId: string): Promise<{ token: string; expiresAt: string }> {
    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlDays * 86_400_000).toISOString();

    await this.userRepository.setInvitationToken(userId, this.hashToken(token), expiresAt);
    return { token, expiresAt };
  }

  async findByToken(token: string): Promise<InvitationView> {
    const user = await this.resolveInvitedUser(token);
    return { userId: user.id, username: user.username, email: user.email };
  }

  async acceptInvitation(token: string, password: string): Promise<InvitationView> {
    const user = await this.resolveInvitedUser(token);

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    await this.userRepository.acceptInvitation(
      user.id,
      this.passwordService.hashPassword(password),
    );

    const access = await this.userAccessRepository.findByUserId(user.id);
    await Promise.all(
      access
        .filter((entry) => entry.status === 'invited')
        .map((entry) => this.userAccessRepository.update(entry.id, { status: 'active' })),
    );

    return { userId: user.id, username: user.username, email: user.email };
  }

  private async resolveInvitedUser(token: string) {
    const value = token.trim();
    if (!value) throw new Error('Invitation token is required');

    const user = await this.userRepository.findByInvitationTokenHash(this.hashToken(value));
    if (!user || user.status !== 'invited') {
      throw new Error('This invitation is no longer valid');
    }
    if (!user.invitationExpiresAt || user.invitationExpiresAt.getTime() <= Date.now()) {
      throw new Error('This invitation has expired');
    }

    return user;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
